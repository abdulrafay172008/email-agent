import React, { useState, useEffect } from 'react';
import './App.css';

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