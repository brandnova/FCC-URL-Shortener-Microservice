require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const { MongoClient } = require('mongodb');
const dns = require('dns');
const urlparser = require('url');

// Create an async function to connect to MongoDB
async function connectToDatabase() {
  try {
    const client = new MongoClient(process.env.MONGO_URL);
    await client.connect();
    console.log('Connected to MongoDB');
    const db = client.db("urlshortner");
    return {
      client,
      urls: db.collection("urls")
    };
  } catch (error) {
    console.error('Failed to connect to MongoDB', error);
    process.exit(1);
  }
}

// Basic Configuration
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use('/public', express.static(`${process.cwd()}/public`));

app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

// Main application logic
let urlsCollection;

// Initialize database connection
connectToDatabase()
  .then(({client, urls}) => {
    urlsCollection = urls;
  })
  .catch(console.error);

// Validate URL function
function isValidUrl(urlString) {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

// URL shortener endpoint
app.post('/api/shorturl', async (req, res) => {
  const url = req.body.url;

  // Validate URL format first
  if (!isValidUrl(url)) {
    return res.json({ error: 'Invalid URL' });
  }

  try {
    // DNS lookup
    const hostname = urlparser.parse(url).hostname;
    return new Promise((resolve, reject) => {
      dns.lookup(hostname, async (err, address) => {
        if (err || !address) {
          res.json({ error: 'Invalid URL' });
          return resolve();
        }

        try {
          const urlCount = await urlsCollection.countDocuments({});
          const urlDoc = {
            url,
            short_url: urlCount
          };

          const result = await urlsCollection.insertOne(urlDoc);
          res.json({ original_url: url, short_url: urlCount });
          resolve();
        } catch (insertError) {
          res.status(500).json({ error: 'Server error' });
          reject(insertError);
        }
      });
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Redirect endpoint
app.get("/api/shorturl/:short_url", async (req, res) => {
  try {
    const shorturl = req.params.short_url;
    const urlDoc = await urlsCollection.findOne({ short_url: +shorturl });

    if (!urlDoc) {
      return res.status(404).json({ error: 'No URL found' });
    }

    res.redirect(urlDoc.url);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Start the server
app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});