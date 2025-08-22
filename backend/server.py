from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Any, Dict
import uuid
from datetime import datetime, timezone
import json
import asyncio
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail, To
from emergentintegrations.llm.chat import LlmChat, UserMessage
import csv
import io
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="AI Email Agent", description="Bulk email sending with AI content generation")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Pydantic Models
class Recipient(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}
    campaign_id: Optional[str] = None
    status: str = "pending"  # pending, sent, failed, delivered, opened, clicked
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class EmailTemplate(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    subject: str
    content: str
    variables: List[str] = []  # Variables that can be personalized
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Campaign(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    subject: str
    content: str
    sender_name: str = "Mass Mailer"
    status: str = "draft"  # draft, sending, completed, failed
    total_recipients: int = 0
    sent_count: int = 0
    failed_count: int = 0
    template_id: Optional[str] = None
    ai_generated: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Request/Response Models
class RecipientCreate(BaseModel):
    email: EmailStr
    name: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = {}

class CampaignCreate(BaseModel):
    name: str
    subject: str
    content: str
    sender_name: str = "Mass Mailer"
    template_id: Optional[str] = None

class AIContentRequest(BaseModel):
    prompt: str
    subject_line: Optional[str] = None
    tone: str = "professional"  # professional, friendly, casual, urgent
    audience: str = "general"
    max_length: Optional[int] = 500

class BulkEmailRequest(BaseModel):
    campaign_id: str
    test_mode: bool = False  # If true, only sends to first 5 recipients

# Initialize AI Chat
def get_ai_chat():
    return LlmChat(
        api_key=os.environ.get('EMERGENT_LLM_KEY'),
        session_id=str(uuid.uuid4()),
        system_message="You are an expert email marketing copywriter. Create engaging, professional email content that drives action while maintaining authenticity and avoiding spam language."
    ).with_model("openai", "gpt-4o-mini")

# Email sending function
async def send_single_email(recipient: Recipient, campaign: Campaign) -> bool:
    """Send a single email and return success status"""
    try:
        # Personalize content if metadata exists
        personalized_content = campaign.content
        personalized_subject = campaign.subject
        
        # Simple personalization
        if recipient.name:
            personalized_content = personalized_content.replace("{{name}}", recipient.name)
            personalized_subject = personalized_subject.replace("{{name}}", recipient.name)
        
        # Replace other metadata variables
        for key, value in (recipient.metadata or {}).items():
            personalized_content = personalized_content.replace(f"{{{{{key}}}}}", str(value))
            personalized_subject = personalized_subject.replace(f"{{{{{key}}}}}", str(value))
        
        # Create SendGrid message
        message = Mail(
            from_email=os.environ.get('SENDER_EMAIL'),
            to_emails=recipient.email,
            subject=personalized_subject,
            html_content=f"""
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        {personalized_content.replace('\n', '<br>')}
                        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                        <p style="font-size: 12px; color: #666;">
                            Sent by {campaign.sender_name} | 
                            <a href="#" style="color: #666;">Unsubscribe</a>
                        </p>
                    </div>
                </body>
            </html>
            """
        )
        
        # Send email
        sg = SendGridAPIClient(os.environ.get('SENDGRID_API_KEY'))
        response = sg.send(message)
        
        return response.status_code == 202
        
    except Exception as e:
        logger.error(f"Failed to send email to {recipient.email}: {str(e)}")
        return False

# Background task for bulk email sending
async def process_bulk_email_campaign(campaign_id: str, test_mode: bool = False):
    """Process bulk email campaign in background"""
    try:
        # Get campaign
        campaign_doc = await db.campaigns.find_one({"id": campaign_id})
        if not campaign_doc:
            logger.error(f"Campaign {campaign_id} not found")
            return
        
        campaign = Campaign(**campaign_doc)
        
        # Update campaign status
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "sending", "updated_at": datetime.now(timezone.utc)}}
        )
        
        # Get recipients
        recipients_cursor = db.recipients.find({"campaign_id": campaign_id, "status": "pending"})
        recipients = []
        async for recipient_doc in recipients_cursor:
            recipients.append(Recipient(**recipient_doc))
        
        # Limit to 5 for test mode
        if test_mode:
            recipients = recipients[:5]
        
        sent_count = 0
        failed_count = 0
        
        # Send emails in batches of 10 with delays to respect rate limits
        batch_size = 10
        for i in range(0, len(recipients), batch_size):
            batch = recipients[i:i + batch_size]
            
            # Process batch
            tasks = []
            for recipient in batch:
                tasks.append(send_single_email(recipient, campaign))
            
            # Execute batch
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Update recipient statuses
            for recipient, result in zip(batch, results):
                if isinstance(result, Exception):
                    await db.recipients.update_one(
                        {"id": recipient.id},
                        {"$set": {"status": "failed"}}
                    )
                    failed_count += 1
                elif result:
                    await db.recipients.update_one(
                        {"id": recipient.id},
                        {"$set": {"status": "sent"}}
                    )
                    sent_count += 1
                else:
                    await db.recipients.update_one(
                        {"id": recipient.id},
                        {"$set": {"status": "failed"}}
                    )
                    failed_count += 1
            
            # Add delay between batches (rate limiting)
            if i + batch_size < len(recipients):
                await asyncio.sleep(1)  # 1 second delay between batches
        
        # Update campaign final status
        final_status = "completed" if failed_count == 0 else "completed_with_errors"
        await db.campaigns.update_one(
            {"id": campaign_id},
            {
                "$set": {
                    "status": final_status,
                    "sent_count": sent_count,
                    "failed_count": failed_count,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        logger.info(f"Campaign {campaign_id} completed. Sent: {sent_count}, Failed: {failed_count}")
        
    except Exception as e:
        logger.error(f"Error processing campaign {campaign_id}: {str(e)}")
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$set": {"status": "failed", "updated_at": datetime.now(timezone.utc)}}
        )

# API Routes
@api_router.get("/")
async def root():
    return {"message": "AI Email Agent API", "version": "1.0.0"}

# AI Content Generation
@api_router.post("/ai/generate-content")
async def generate_ai_content(request: AIContentRequest):
    """Generate AI email content based on prompt"""
    try:
        chat = get_ai_chat()
        
        prompt = f"""
        Create an engaging email for the following request:
        
        Prompt: {request.prompt}
        Tone: {request.tone}
        Target Audience: {request.audience}
        Maximum Length: {request.max_length or 500} words
        
        Please provide:
        1. A compelling subject line
        2. Email content that's engaging and action-oriented
        3. Include personalization placeholders like {{{{name}}}} where appropriate
        
        Format the response as JSON with 'subject' and 'content' fields.
        Make sure the content is professional, avoids spam words, and includes a clear call-to-action.
        """
        
        if request.subject_line:
            prompt += f"\nSuggested subject line: {request.subject_line}"
        
        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        # Try to parse JSON response
        try:
            result = json.loads(response)
            return {
                "subject": result.get("subject", "Generated Email"),
                "content": result.get("content", response),
                "ai_generated": True
            }
        except json.JSONDecodeError:
            # If not JSON, extract subject and content manually
            lines = response.split('\n')
            subject = "Generated Email"
            content = response
            
            for line in lines:
                if 'subject' in line.lower() and ':' in line:
                    subject = line.split(':', 1)[1].strip().strip('"')
                    break
            
            return {
                "subject": subject,
                "content": content,
                "ai_generated": True
            }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI content generation failed: {str(e)}")

# Template Management
@api_router.post("/templates", response_model=EmailTemplate)
async def create_template(template: EmailTemplate):
    """Create a new email template"""
    template_dict = template.dict()
    await db.templates.insert_one(template_dict)
    return template

@api_router.get("/templates", response_model=List[EmailTemplate])
async def get_templates():
    """Get all email templates"""
    templates = await db.templates.find().to_list(100)
    return [EmailTemplate(**template) for template in templates]

@api_router.get("/templates/{template_id}", response_model=EmailTemplate)
async def get_template(template_id: str):
    """Get a specific template"""
    template = await db.templates.find_one({"id": template_id})
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return EmailTemplate(**template)

# Campaign Management
@api_router.post("/campaigns", response_model=Campaign)
async def create_campaign(campaign: CampaignCreate):
    """Create a new email campaign"""
    new_campaign = Campaign(**campaign.dict())
    campaign_dict = new_campaign.dict()
    await db.campaigns.insert_one(campaign_dict)
    return new_campaign

@api_router.get("/campaigns", response_model=List[Campaign])
async def get_campaigns():
    """Get all campaigns"""
    campaigns = await db.campaigns.find().sort("created_at", -1).to_list(100)
    return [Campaign(**campaign) for campaign in campaigns]

@api_router.get("/campaigns/{campaign_id}", response_model=Campaign)
async def get_campaign(campaign_id: str):
    """Get a specific campaign"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return Campaign(**campaign)

@api_router.put("/campaigns/{campaign_id}", response_model=Campaign)
async def update_campaign(campaign_id: str, updates: dict):
    """Update a campaign"""
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.campaigns.update_one({"id": campaign_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    updated_campaign = await db.campaigns.find_one({"id": campaign_id})
    return Campaign(**updated_campaign)

# Recipient Management
@api_router.post("/campaigns/{campaign_id}/recipients", response_model=Recipient)
async def add_recipient(campaign_id: str, recipient: RecipientCreate):
    """Add a single recipient to a campaign"""
    # Check if campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    new_recipient = Recipient(**recipient.dict(), campaign_id=campaign_id)
    recipient_dict = new_recipient.dict()
    await db.recipients.insert_one(recipient_dict)
    
    # Update campaign recipient count
    await db.campaigns.update_one(
        {"id": campaign_id},
        {"$inc": {"total_recipients": 1}}
    )
    
    return new_recipient

@api_router.post("/campaigns/{campaign_id}/recipients/csv")
async def upload_recipients_csv(campaign_id: str, file: UploadFile = File(...)):
    """Upload recipients from CSV file"""
    # Check if campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    try:
        contents = await file.read()
        csv_data = contents.decode('utf-8')
        csv_reader = csv.DictReader(io.StringIO(csv_data))
        
        recipients_added = 0
        errors = []
        
        for row_num, row in enumerate(csv_reader, 1):
            try:
                # Required: email
                if 'email' not in row or not row['email']:
                    errors.append(f"Row {row_num}: Missing email")
                    continue
                
                # Optional fields
                name = row.get('name', '')
                metadata = {}
                
                # Add any additional columns as metadata
                for key, value in row.items():
                    if key not in ['email', 'name'] and value:
                        metadata[key] = value
                
                recipient = Recipient(
                    email=row['email'],
                    name=name if name else None,
                    metadata=metadata,
                    campaign_id=campaign_id
                )
                
                await db.recipients.insert_one(recipient.dict())
                recipients_added += 1
                
            except Exception as e:
                errors.append(f"Row {row_num}: {str(e)}")
        
        # Update campaign recipient count
        await db.campaigns.update_one(
            {"id": campaign_id},
            {"$inc": {"total_recipients": recipients_added}}
        )
        
        return {
            "recipients_added": recipients_added,
            "errors": errors,
            "total_errors": len(errors)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing CSV: {str(e)}")

@api_router.get("/campaigns/{campaign_id}/recipients", response_model=List[Recipient])
async def get_campaign_recipients(campaign_id: str):
    """Get all recipients for a campaign"""
    recipients = await db.recipients.find({"campaign_id": campaign_id}).to_list(1000)
    return [Recipient(**recipient) for recipient in recipients]

# Bulk Email Sending
@api_router.post("/campaigns/{campaign_id}/send")
async def send_bulk_email(campaign_id: str, request: BulkEmailRequest, background_tasks: BackgroundTasks):
    """Send bulk emails for a campaign"""
    # Check if campaign exists
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Check if campaign has recipients
    recipient_count = await db.recipients.count_documents({"campaign_id": campaign_id})
    if recipient_count == 0:
        raise HTTPException(status_code=400, detail="Campaign has no recipients")
    
    # Add to background tasks
    background_tasks.add_task(process_bulk_email_campaign, campaign_id, request.test_mode)
    
    return {
        "message": "Email campaign started",
        "campaign_id": campaign_id,
        "total_recipients": recipient_count,
        "test_mode": request.test_mode,
        "status": "sending"
    }

# Analytics
@api_router.get("/campaigns/{campaign_id}/analytics")
async def get_campaign_analytics(campaign_id: str):
    """Get campaign analytics and statistics"""
    campaign = await db.campaigns.find_one({"id": campaign_id})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    
    # Get recipient stats
    total_recipients = await db.recipients.count_documents({"campaign_id": campaign_id})
    sent_count = await db.recipients.count_documents({"campaign_id": campaign_id, "status": "sent"})
    failed_count = await db.recipients.count_documents({"campaign_id": campaign_id, "status": "failed"})
    pending_count = await db.recipients.count_documents({"campaign_id": campaign_id, "status": "pending"})
    
    # Calculate rates
    success_rate = (sent_count / total_recipients * 100) if total_recipients > 0 else 0
    failure_rate = (failed_count / total_recipients * 100) if total_recipients > 0 else 0
    
    return {
        "campaign_id": campaign_id,
        "campaign_name": campaign.get("name"),
        "status": campaign.get("status"),
        "total_recipients": total_recipients,
        "sent_count": sent_count,
        "failed_count": failed_count,
        "pending_count": pending_count,
        "success_rate": round(success_rate, 2),
        "failure_rate": round(failure_rate, 2),
        "created_at": campaign.get("created_at"),
        "updated_at": campaign.get("updated_at")
    }

# Health check
@api_router.get("/health")
async def health_check():
    return {"status": "healthy", "service": "ai-email-agent"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()