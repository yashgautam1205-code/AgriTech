const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { state: dbState } = require('../config/db');
const Scan = require('../models/Scan');
const ChatMessage = require('../models/Chat');

const dataDir = path.join(__dirname, '..', 'data');
const scansFile = path.join(dataDir, 'scans.json');
const chatsFile = path.join(dataDir, 'chats.json');
const shopsFile = path.join(dataDir, 'shops.json');
let scansCache = [];
let chatsCache = [];
let shopsCache = [];
let initialized = false;

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(1));
}

async function ensureFiles() {
  if (initialized) return;
  await fs.mkdir(dataDir, { recursive: true });
  for (const file of [scansFile, chatsFile, shopsFile]) {
    try {
      await fs.access(file);
    } catch (err) {
      await fs.writeFile(file, '[]', 'utf8');
    }
  }
  try {
    scansCache = JSON.parse(await fs.readFile(scansFile, 'utf8') || '[]');
  } catch (err) {
    scansCache = [];
  }
  try {
    chatsCache = JSON.parse(await fs.readFile(chatsFile, 'utf8') || '[]');
  } catch (err) {
    chatsCache = [];
  }
  try {
    shopsCache = JSON.parse(await fs.readFile(shopsFile, 'utf8') || '[]');
  } catch (err) {
    shopsCache = [];
  }
  initialized = true;
}

function createId() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function saveScan(scanData) {
  if (dbState.connected) {
    try {
      const scan = new Scan(scanData);
      return await scan.save();
    } catch (err) {
      console.warn('MongoDB saveScan failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }

  await ensureFiles();
  const scan = {
    ...scanData,
    _id: scanData._id || createId(),
    createdAt: scanData.createdAt || new Date().toISOString()
  };
  scansCache.push(scan);
  await writeJson(scansFile, scansCache);
  return scan;
}

async function findScanById(scanId) {
  if (dbState.connected) {
    try {
      return await Scan.findById(scanId).lean();
    } catch (err) {
      console.warn('MongoDB findScanById failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }

  await ensureFiles();
  return scansCache.find(item => String(item._id) === String(scanId)) || null;
}

async function findScansByUser(userId) {
  if (dbState.connected) {
    try {
      return await Scan.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
    } catch (err) {
      console.warn('MongoDB findScansByUser failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }

  await ensureFiles();
  return scansCache.filter(item => item.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50);
}

async function saveChatMessage(chatData) {
  if (dbState.connected) {
    try {
      const safeChatData = { ...chatData };
      if (safeChatData.scanId && !mongoose.Types.ObjectId.isValid(safeChatData.scanId)) {
        delete safeChatData.scanId;
      }
      const message = new ChatMessage(safeChatData);
      return await message.save();
    } catch (err) {
      console.warn('MongoDB saveChatMessage failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }
  await ensureFiles();
  const message = {
    ...chatData,
    _id: chatData._id || createId(),
    createdAt: chatData.createdAt || new Date().toISOString()
  };
  chatsCache.push(message);
  await writeJson(chatsFile, chatsCache);
  return message;
}

async function findChatByScanId(scanId) {
  if (dbState.connected) {
    try {
      return await ChatMessage.find({ scanId }).sort({ createdAt: 1 }).lean();
    } catch (err) {
      console.warn('MongoDB findChatByScanId failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }
  await ensureFiles();
  return chatsCache.filter(item => String(item.scanId) === String(scanId)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function findChatByUser(userId) {
  if (dbState.connected) {
    try {
      return await ChatMessage.find({ userId }).sort({ createdAt: 1 }).lean();
    } catch (err) {
      console.warn('MongoDB findChatByUser failed, falling back to JSON persistence:', err.message);
      dbState.connected = false;
    }
  }
  await ensureFiles();
  return chatsCache.filter(item => item.userId === userId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function saveShops(shopsData) {
  await ensureFiles();
  shopsCache = shopsData;
  await writeJson(shopsFile, shopsCache);
  return shopsCache;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (R * c).toFixed(1);
}

async function findNearbyShops(lat, lon, radius = 15, sellsChemical = true) {
  await ensureFiles();
  const shopsWithDistance = shopsCache
    .filter(shop => sellsChemical ? shop.sellsChemical : true)
    .map(shop => ({
      ...shop,
      distance: calculateDistance(lat, lon, shop.lat, shop.lon)
    }))
    .sort((a, b) => a.distance - b.distance);

  const shops = shopsWithDistance.filter(shop => shop.distance <= radius);
  if (shops.length > 0) {
    return shops;
  }

  // If no shops are within the requested radius, return the nearest shops by distance
  return shopsWithDistance.slice(0, 10);
}

module.exports = {
  saveScan,
  findScanById,
  findScansByUser,
  saveChatMessage,
  findChatByScanId,
  findChatByUser,
  saveShops,
  findNearbyShops
};
