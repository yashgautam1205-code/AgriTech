const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const {
  uploadCropImage,
  getHistory,
  health,
  assistantReply,
  getChatHistory,
  getUserChatHistory,
  getNearbyShops,
  getGovernmentSchemes
} = require('../controllers/scanController');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const uploadPath = path.resolve(__dirname, '..', UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const handleImageUpload = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return next(err);
    Promise.resolve(uploadCropImage(req, res)).catch(next);
  });
};

router.post('/upload-crop-image', handleImageUpload);
router.post('/assistant', asyncHandler(assistantReply));
router.get('/assistant/history/:scanId', asyncHandler(getChatHistory));
router.get('/assistant/history/user/:userId', asyncHandler(getUserChatHistory));
router.get('/history/:userId', asyncHandler(getHistory));
router.get('/nearby-shops', asyncHandler(getNearbyShops));
router.get('/government-schemes', asyncHandler(getGovernmentSchemes));
router.get('/health', asyncHandler(health));

module.exports = router;
