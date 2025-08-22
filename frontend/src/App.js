import React, { useState, useEffect } from 'react';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [campaigns, setCampaigns] = useState([]);
  const [currentCampaign, setCurrentCampaign] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const { toast } = useToast();

  // Form states
  const [campaignForm, setCampaignForm] = useState({
    name: '',
    subject: '',
    content: '',
    sender_name: 'Mass Mailer'
  });

  const [recipientForm, setRecipientForm] = useState({
    email: '',
    name: '',
    metadata: {}
  });

  const [aiForm, setAiForm] = useState({
    prompt: '',
    tone: 'professional',
    audience: 'general',
    max_length: 500
  });

  const [csvFile, setCsvFile] = useState(null);

  // Load campaigns on mount
  useEffect(() => {
    loadCampaigns();
  }, []);

  // Load campaign analytics when current campaign changes
  useEffect(() => {
    if (currentCampaign) {
      loadRecipients(currentCampaign.id);
      loadAnalytics(currentCampaign.id);
    }
  }, [currentCampaign]);

  const loadCampaigns = async () => {
    try {
      const response = await axios.get(`${API}/campaigns`);
      setCampaigns(response.data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load campaigns",
        variant: "destructive"
      });
    }
  };

  const loadRecipients = async (campaignId) => {
    try {
      const response = await axios.get(`${API}/campaigns/${campaignId}/recipients`);
      setRecipients(response.data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load recipients",
        variant: "destructive"
      });
    }
  };

  const loadAnalytics = async (campaignId) => {
    try {
      const response = await axios.get(`${API}/campaigns/${campaignId}/analytics`);
      setAnalytics(response.data);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    }
  };

  const createCampaign = async () => {
    if (!campaignForm.name || !campaignForm.subject || !campaignForm.content) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/campaigns`, campaignForm);
      setCampaigns([response.data, ...campaigns]);
      setCurrentCampaign(response.data);
      setCampaignForm({
        name: '',
        subject: '',
        content: '',
        sender_name: 'Mass Mailer'
      });
      toast({
        title: "Success",
        description: "Campaign created successfully!"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create campaign",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateAIContent = async () => {
    if (!aiForm.prompt) {
      toast({
        title: "Error",
        description: "Please provide a prompt for AI content generation",
        variant: "destructive"
      });
      return;
    }

    setAiLoading(true);
    try {
      const response = await axios.post(`${API}/ai/generate-content`, aiForm);
      setCampaignForm({
        ...campaignForm,
        subject: response.data.subject,
        content: response.data.content
      });
      toast({
        title: "Success",
        description: "AI content generated successfully!"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate AI content",
        variant: "destructive"
      });
    } finally {
      setAiLoading(false);
    }
  };

  const addRecipient = async () => {
    if (!currentCampaign || !recipientForm.email) {
      toast({
        title: "Error",
        description: "Please select a campaign and provide an email",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/campaigns/${currentCampaign.id}/recipients`, recipientForm);
      setRecipients([...recipients, response.data]);
      setRecipientForm({ email: '', name: '', metadata: {} });
      toast({
        title: "Success",
        description: "Recipient added successfully!"
      });
      loadAnalytics(currentCampaign.id);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add recipient",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const uploadCSV = async () => {
    if (!currentCampaign || !csvFile) {
      toast({
        title: "Error",
        description: "Please select a campaign and CSV file",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', csvFile);

    try {
      const response = await axios.post(`${API}/campaigns/${currentCampaign.id}/recipients/csv`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      toast({
        title: "Success",
        description: `Added ${response.data.recipients_added} recipients. ${response.data.total_errors} errors.`
      });
      
      loadRecipients(currentCampaign.id);
      loadAnalytics(currentCampaign.id);
      setCsvFile(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload CSV",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const sendBulkEmail = async (testMode = false) => {
    if (!currentCampaign) {
      toast({
        title: "Error",
        description: "Please select a campaign",
        variant: "destructive"
      });
      return;
    }

    if (recipients.length === 0) {
      toast({
        title: "Error",
        description: "Campaign has no recipients",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/campaigns/${currentCampaign.id}/send`, {
        campaign_id: currentCampaign.id,
        test_mode: testMode
      });
      
      toast({
        title: "Success",
        description: `Email campaign started! ${testMode ? '(Test mode - first 5 recipients)' : ''}`
      });
      
      // Refresh analytics periodically
      const interval = setInterval(() => {
        loadAnalytics(currentCampaign.id);
        loadCampaigns();
      }, 3000);
      
      setTimeout(() => clearInterval(interval), 30000); // Stop after 30 seconds
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send emails",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'sent':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      'draft': 'secondary',
      'sending': 'default',
      'completed': 'default',
      'failed': 'destructive'
    };
    return <Badge variant={variants[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            <Brain className="h-10 w-10 text-blue-400" />
            AI Email Agent
          </h1>
          <p className="text-slate-300">Intelligent bulk email campaigns with AI-powered content generation</p>
        </div>

        <Tabs defaultValue="campaigns" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 bg-slate-800 border-slate-700">
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-blue-600">
              <Mail className="h-4 w-4 mr-2" />
              Campaigns
            </TabsTrigger>
            <TabsTrigger value="recipients" className="data-[state=active]:bg-blue-600">
              <Users className="h-4 w-4 mr-2" />
              Recipients
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-blue-600">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
            <TabsTrigger value="ai-content" className="data-[state=active]:bg-blue-600">
              <Brain className="h-4 w-4 mr-2" />
              AI Content
            </TabsTrigger>
          </TabsList>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Create Campaign */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Create New Campaign
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Set up your email campaign details
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="campaign-name" className="text-white">Campaign Name</Label>
                    <Input
                      id="campaign-name"
                      value={campaignForm.name}
                      onChange={(e) => setCampaignForm({...campaignForm, name: e.target.value})}
                      placeholder="Summer Sale Campaign"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="subject" className="text-white">Subject Line</Label>
                    <Input
                      id="subject"
                      value={campaignForm.subject}
                      onChange={(e) => setCampaignForm({...campaignForm, subject: e.target.value})}
                      placeholder="🎉 Exclusive Summer Sale - 50% Off!"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sender-name" className="text-white">Sender Name</Label>
                    <Input
                      id="sender-name"
                      value={campaignForm.sender_name}
                      onChange={(e) => setCampaignForm({...campaignForm, sender_name: e.target.value})}
                      placeholder="Your Company Name"
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="content" className="text-white">Email Content</Label>
                    <Textarea
                      id="content"
                      rows={6}
                      value={campaignForm.content}
                      onChange={(e) => setCampaignForm({...campaignForm, content: e.target.value})}
                      placeholder="Hi {{name}}, we're excited to announce our summer sale..."
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                    <p className="text-xs text-slate-400 mt-1">Use {{name}} for personalization</p>
                  </div>
                  <Button 
                    onClick={createCampaign} 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700"
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Campaign
                  </Button>
                </CardContent>
              </Card>

              {/* Campaign List */}
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Your Campaigns
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Manage your email campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {campaigns.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">No campaigns yet. Create your first campaign!</p>
                  ) : (
                    campaigns.slice(0, 5).map((campaign) => (
                      <div
                        key={campaign.id}
                        className={`p-4 rounded-lg border cursor-pointer transition-all ${
                          currentCampaign?.id === campaign.id
                            ? 'bg-blue-900/50 border-blue-500'
                            : 'bg-slate-700 border-slate-600 hover:bg-slate-600'
                        }`}
                        onClick={() => setCurrentCampaign(campaign)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-semibold text-white">{campaign.name}</h3>
                          {getStatusBadge(campaign.status)}
                        </div>
                        <p className="text-sm text-slate-300 mb-2">{campaign.subject}</p>
                        <div className="flex justify-between text-xs text-slate-400">
                          <span>{campaign.total_recipients || 0} recipients</span>
                          <span>{new Date(campaign.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Send Campaign */}
            {currentCampaign && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Send Campaign: {currentCampaign.name}
                  </CardTitle>
                  <CardDescription className="text-slate-400">
                    Ready to send your campaign to {recipients.length} recipients
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
                    <Button 
                      onClick={() => sendBulkEmail(true)}
                      disabled={loading || recipients.length === 0}
                      variant="outline"
                      className="bg-slate-700 border-slate-600 text-white hover:bg-slate-600"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Test Send (5 recipients)
                    </Button>
                    <Button 
                      onClick={() => sendBulkEmail(false)}
                      disabled={loading || recipients.length === 0}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                      Send to All ({recipients.length})
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Recipients Tab */}
          <TabsContent value="recipients" className="space-y-6">
            {!currentCampaign ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-400">Please select a campaign first</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Manual Add */}
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Plus className="h-5 w-5" />
                        Add Recipient
                      </CardTitle>
                      <CardDescription className="text-slate-400">
                        Add recipients manually to {currentCampaign.name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="recipient-email" className="text-white">Email Address</Label>
                        <Input
                          id="recipient-email"
                          type="email"
                          value={recipientForm.email}
                          onChange={(e) => setRecipientForm({...recipientForm, email: e.target.value})}
                          placeholder="user@example.com"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="recipient-name" className="text-white">Name (Optional)</Label>
                        <Input
                          id="recipient-name"
                          value={recipientForm.name}
                          onChange={(e) => setRecipientForm({...recipientForm, name: e.target.value})}
                          placeholder="John Doe"
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                      </div>
                      <Button 
                        onClick={addRecipient} 
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                        Add Recipient
                      </Button>
                    </CardContent>
                  </Card>

                  {/* CSV Upload */}
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center gap-2">
                        <Upload className="h-5 w-5" />
                        Upload CSV
                      </CardTitle>
                      <CardDescription className="text-slate-400">
                        Upload multiple recipients from CSV file
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label htmlFor="csv-file" className="text-white">CSV File</Label>
                        <Input
                          id="csv-file"
                          type="file"
                          accept=".csv"
                          onChange={(e) => setCsvFile(e.target.files[0])}
                          className="bg-slate-700 border-slate-600 text-white"
                        />
                        <p className="text-xs text-slate-400 mt-1">CSV should have 'email' column. Optional: 'name' column</p>
                      </div>
                      <Button 
                        onClick={uploadCSV} 
                        disabled={loading || !csvFile}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                        Upload Recipients
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Recipients List */}
                <Card className="bg-slate-800 border-slate-700">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Recipients ({recipients.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {recipients.length === 0 ? (
                      <p className="text-slate-400 text-center py-8">No recipients added yet</p>
                    ) : (
                      <div className="space-y-3 max-h-96 overflow-y-auto">
                        {recipients.map((recipient) => (
                          <div key={recipient.id} className="flex items-center justify-between p-3 bg-slate-700 rounded-lg">
                            <div className="flex items-center gap-3">
                              {getStatusIcon(recipient.status)}
                              <div>
                                <p className="text-white font-medium">{recipient.email}</p>
                                {recipient.name && <p className="text-slate-400 text-sm">{recipient.name}</p>}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {recipient.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            {!currentCampaign ? (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-12 text-center">
                  <BarChart3 className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-400">Please select a campaign first</p>
                </CardContent>
              </Card>
            ) : analytics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm">Total Recipients</p>
                        <p className="text-2xl font-bold text-white">{analytics.total_recipients}</p>
                      </div>
                      <Users className="h-8 w-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm">Sent</p>
                        <p className="text-2xl font-bold text-green-400">{analytics.sent_count}</p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm">Failed</p>
                        <p className="text-2xl font-bold text-red-400">{analytics.failed_count}</p>
                      </div>
                      <XCircle className="h-8 w-8 text-red-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800 border-slate-700">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-slate-400 text-sm">Success Rate</p>
                        <p className="text-2xl font-bold text-blue-400">{analytics.success_rate}%</p>
                      </div>
                      <BarChart3 className="h-8 w-8 text-blue-400" />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-800 border-slate-700 md:col-span-2 lg:col-span-4">
                  <CardHeader>
                    <CardTitle className="text-white">Campaign Progress</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-slate-400">Sent Progress</span>
                        <span className="text-white">{analytics.sent_count} / {analytics.total_recipients}</span>
                      </div>
                      <Progress 
                        value={analytics.total_recipients > 0 ? (analytics.sent_count / analytics.total_recipients) * 100 : 0} 
                        className="bg-slate-700"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-slate-400">Status: </span>
                        <span className="text-white">{analytics.status}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Pending: </span>
                        <span className="text-yellow-400">{analytics.pending_count}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="bg-slate-800 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Loader2 className="h-12 w-12 text-slate-400 mx-auto mb-4 animate-spin" />
                  <p className="text-slate-400">Loading analytics...</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* AI Content Tab */}
          <TabsContent value="ai-content" className="space-y-6">
            <Card className="bg-slate-800 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Brain className="h-5 w-5" />
                  AI Content Generator
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Generate compelling email content using AI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="ai-prompt" className="text-white">What should the email be about?</Label>
                    <Textarea
                      id="ai-prompt"
                      rows={3}
                      value={aiForm.prompt}
                      onChange={(e) => setAiForm({...aiForm, prompt: e.target.value})}
                      placeholder="Write an email about our new product launch, highlighting the key features and special discount..."
                      className="bg-slate-700 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="ai-tone" className="text-white">Tone</Label>
                      <Select value={aiForm.tone} onValueChange={(value) => setAiForm({...aiForm, tone: value})}>
                        <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-700 border-slate-600">
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="urgent">Urgent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="ai-audience" className="text-white">Target Audience</Label>
                      <Input
                        id="ai-audience"
                        value={aiForm.audience}
                        onChange={(e) => setAiForm({...aiForm, audience: e.target.value})}
                        placeholder="Business owners, tech enthusiasts, etc."
                        className="bg-slate-700 border-slate-600 text-white"
                      />
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={generateAIContent} 
                  disabled={aiLoading}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                  Generate AI Content
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </div>
  );
}

export default App;