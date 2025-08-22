import requests
import sys
import json
from datetime import datetime

class AIEmailAgentTester:
    def __init__(self, base_url="https://mass-mailer-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.campaign_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, files=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}" if endpoint else f"{self.api_url}/"
        headers = {'Content-Type': 'application/json'} if not files else {}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, data=data, timeout=10)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Error: {response.text[:200]}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health check endpoint"""
        return self.run_test("Health Check", "GET", "", 200)

    def test_root_endpoint(self):
        """Test root API endpoint"""
        return self.run_test("Root Endpoint", "GET", "", 200)

    def test_ai_content_generation(self):
        """Test AI content generation"""
        ai_request = {
            "prompt": "Create an email about a summer sale with 20% discount",
            "tone": "professional",
            "audience": "customers",
            "max_length": 300
        }
        return self.run_test("AI Content Generation", "POST", "ai/generate-content", 200, ai_request)

    def test_create_campaign(self):
        """Test campaign creation"""
        campaign_data = {
            "name": f"Test Campaign {datetime.now().strftime('%H%M%S')}",
            "subject": "Test Email Subject",
            "content": "Hello {{name}}, this is a test email content.",
            "sender_name": "Test Sender"
        }
        success, response = self.run_test("Create Campaign", "POST", "campaigns", 200, campaign_data)
        if success and 'id' in response:
            self.campaign_id = response['id']
            print(f"   Campaign ID: {self.campaign_id}")
        return success, response

    def test_get_campaigns(self):
        """Test getting all campaigns"""
        return self.run_test("Get Campaigns", "GET", "campaigns", 200)

    def test_get_campaign_by_id(self):
        """Test getting specific campaign"""
        if not self.campaign_id:
            print("❌ Skipped - No campaign ID available")
            return False, {}
        return self.run_test("Get Campaign by ID", "GET", f"campaigns/{self.campaign_id}", 200)

    def test_add_recipient(self):
        """Test adding a recipient to campaign"""
        if not self.campaign_id:
            print("❌ Skipped - No campaign ID available")
            return False, {}
        
        recipient_data = {
            "email": "test@example.com",
            "name": "Test User"
        }
        return self.run_test("Add Recipient", "POST", f"campaigns/{self.campaign_id}/recipients", 200, recipient_data)

    def test_get_recipients(self):
        """Test getting campaign recipients"""
        if not self.campaign_id:
            print("❌ Skipped - No campaign ID available")
            return False, {}
        return self.run_test("Get Recipients", "GET", f"campaigns/{self.campaign_id}/recipients", 200)

    def test_campaign_analytics(self):
        """Test campaign analytics"""
        if not self.campaign_id:
            print("❌ Skipped - No campaign ID available")
            return False, {}
        return self.run_test("Campaign Analytics", "GET", f"campaigns/{self.campaign_id}/analytics", 200)

    def test_health_endpoint(self):
        """Test health endpoint"""
        return self.run_test("Health Endpoint", "GET", "health", 200)

def main():
    print("🚀 Starting AI Email Agent Backend Tests")
    print("=" * 50)
    
    tester = AIEmailAgentTester()
    
    # Run all tests
    tests = [
        tester.test_root_endpoint,
        tester.test_health_endpoint,
        tester.test_ai_content_generation,
        tester.test_create_campaign,
        tester.test_get_campaigns,
        tester.test_get_campaign_by_id,
        tester.test_add_recipient,
        tester.test_get_recipients,
        tester.test_campaign_analytics
    ]
    
    for test in tests:
        try:
            test()
        except Exception as e:
            print(f"❌ Test failed with exception: {str(e)}")
    
    # Print final results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())