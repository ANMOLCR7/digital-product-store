const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client')));
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

// Products API
app.get('/api/products', (req, res) => {
  const data = fs.readFileSync(path.join(__dirname, 'data/products.json'));
  res.json(JSON.parse(data));
});

// Free Download route (no payment required)
app.get('/download/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'downloads', req.params.filename);
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).send('File not found.');
  }
});

// Optional admin routes can go here
// app.use('/api/admin', require('./routes/admin'));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));