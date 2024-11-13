const express = require('express');  
const WebSocket = require('ws');
const { createClient } = require('redis');

// Initialize Express app
const app = express();
const PORT = 4000;

// Middleware for parsing JSON requests
app.use(express.json());

// Initialize WebSocket server
const wss = new WebSocket.Server({ noServer: true });

// Initialize Redis clients (publisher and subscriber)
const pubClient = createClient();
const subClient = createClient();

// Handle Redis connection errors
pubClient.on('error', (err) => {
    console.error('Redis Pub Client Error', err);
});

subClient.on('error', (err) => {
    console.error('Redis Sub Client Error', err);
});

// Map to track connected clients by userId
const clients = new Map();

// WebSocket connection event
wss.on('connection', (ws, req) => {
    const userId = req.url.split('/')[1]; // Get userId from URL
    clients.set(userId, ws); // Store WebSocket connection
    console.log(`User ${userId} connected`);

    ws.on('close', () => {
        clients.delete(userId); // Remove client on disconnect
        console.log(`User ${userId} disconnected`);
    });
});

// Subscribe to Redis notifications channel
const subscribeToNotifications = async () => {
    await subClient.connect(); // Connect the subscriber client
    
    await subClient.subscribe('notifications', (message) => {
        const { userId, notification } = JSON.parse(message);

        // Send notification to the specific client (userId)
        if (clients.has(userId)) {
            clients.get(userId).send(JSON.stringify({ notification }));
            console.log(`Sent notification to user ${userId}: ${notification}`);
        }
    });
};

// Express route to publish notifications
app.post('/send-notification', async (req, res) => {
    const { userId, notification } = req.body;

    try {
        // Ensure Redis publisher client is connected before publishing
        if (!pubClient.isOpen) {
            await pubClient.connect();
        }

        await pubClient.publish('notifications', JSON.stringify({ userId, notification }));
        console.log(`Notification sent for user ${userId}: ${notification}`);
        res.sendStatus(200);
    } catch (error) {
        console.error('Error sending notification:', error);
        res.status(500).send('Failed to send notification');
    }
});

// Create server and handle WebSocket upgrades
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    subscribeToNotifications(); // Start subscribing to notifications
});

server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
    });
});

// Serve static files from the 'public' directory
app.use(express.static('public'));
