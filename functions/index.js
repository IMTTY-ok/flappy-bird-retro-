const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const express = require('express');
const cors = require('cors');

initializeApp();
const db = getFirestore();
const SCORES = 'scores';

const app = express();
app.use(cors());
app.use(express.json());

// GET leaderboard - top 50 all time
app.get('/api/leaderboard', async (req, res) => {
    try {
        const snap = await db.collection(SCORES).orderBy('score', 'desc').limit(50).get();
        const scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ scores });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to read leaderboard' });
    }
});

// GET today's leaderboard
app.get('/api/leaderboard/today', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const snap = await db.collection(SCORES)
            .where('date', '==', today)
            .orderBy('score', 'desc')
            .limit(50)
            .get();
        const scores = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        res.json({ scores });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to read today leaderboard' });
    }
});

// POST new score
app.post('/api/leaderboard', async (req, res) => {
    try {
        const { name, score } = req.body;

        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Name is required' });
        }
        if (typeof score !== 'number' || score < 0 || score > 9999) {
            return res.status(400).json({ error: 'Invalid score' });
        }

        const cleanName = name.trim().substring(0, 15).toUpperCase();

        const entry = {
            name: cleanName,
            score: Math.floor(score),
            date: new Date().toISOString().split('T')[0],
            timestamp: new Date().toISOString(),
            createdAt: FieldValue.serverTimestamp()
        };

        const ref = await db.collection(SCORES).add(entry);

        // Compute rank from sorted scores
        const sortedSnap = await db.collection(SCORES).orderBy('score', 'desc').get();
        const rank = sortedSnap.docs.findIndex(d => d.id === ref.id) + 1;

        res.json({ success: true, rank, entry: { id: ref.id, ...entry } });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to submit score' });
    }
});

// GET player stats
app.get('/api/leaderboard/player/:name', async (req, res) => {
    try {
        const name = req.params.name.toUpperCase();
        const snap = await db.collection(SCORES).where('name', '==', name).get();

        const playerScores = snap.docs.map(d => d.data());
        const today = new Date().toISOString().split('T')[0];
        const todayScores = playerScores.filter(s => s.date === today);

        const allTimeBest = playerScores.length > 0
            ? Math.max(...playerScores.map(s => s.score))
            : 0;
        const todayBest = todayScores.length > 0
            ? Math.max(...todayScores.map(s => s.score))
            : 0;
        const totalGames = playerScores.length;

        res.json({ name, allTimeBest, todayBest, totalGames });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to read player stats' });
    }
});

exports.api = onRequest(
    { region: 'us-central1', cors: true },
    app
);
