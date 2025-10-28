#!/usr/bin/env node
/**
 * Debug connection to the API server
 */

const http = require('http');
const net = require('net');

// Test if port 8080 is open
function testPort(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    
    socket.setTimeout(3000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(port, '127.0.0.1');
  });
}

async function debugConnection() {
  console.log('🔍 Debugging API connection...\n');
  
  // Test port connectivity
  console.log('1. Testing port 8080 connectivity...');
  const isPortOpen = await testPort(8080);
  console.log(`   Port 8080 open: ${isPortOpen ? '✅ YES' : '❌ NO'}\n`);
  
  if (!isPortOpen) {
    console.log('❌ Port 8080 is not accessible. Server might not be running.');
    console.log('💡 Make sure you have the server running with: npm run dev\n');
    return;
  }
  
  // Test basic HTTP connection
  console.log('2. Testing basic HTTP connection...');
  
  const req = http.request({
    hostname: '127.0.0.1',
    port: 8080,
    path: '/',
    method: 'GET',
    timeout: 5000
  }, (res) => {
    console.log(`   HTTP Status: ${res.statusCode}`);
    console.log(`   Headers:`, res.headers);
    
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`   Response length: ${body.length} characters`);
      if (body.length < 1000) {
        console.log(`   Response preview: ${body.substring(0, 500)}`);
      }
    });
  });
  
  req.on('timeout', () => {
    console.log('❌ Request timed out after 5 seconds');
    req.destroy();
  });
  
  req.on('error', (err) => {
    console.log(`❌ Request error: ${err.message}`);
  });
  
  req.end();
}

debugConnection();