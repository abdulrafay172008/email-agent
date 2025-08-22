import React, { useState, useEffect } from 'react';
import './App.css';
import axios from 'axios';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Textarea } from './components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { Badge } from './components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Progress } from './components/ui/progress';
import { 
  Send, 
  Upload, 
  Users, 
  Mail, 
  Brain, 
  BarChart3, 
  Plus,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  Clock
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2 flex items-center gap-3">
            AI Email Agent
          </h1>
          <p className="text-slate-300">Intelligent bulk email campaigns with AI-powered content generation</p>
        </div>
        <div className="text-white">
          <p>Frontend is loading successfully!</p>
          <p>Backend URL: {process.env.REACT_APP_BACKEND_URL}</p>
        </div>
      </div>
    </div>
  );
}

export default App;