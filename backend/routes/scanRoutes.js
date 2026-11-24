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
  getGovernmentSchemes,
  predictCrop,
  getCropModelInfo
} = require('../controllers/scanController');
const { recommendIrrigation } = require('../controllers/agricultureController');

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
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      const error = new Error('Unsupported image type');
      error.code = 'UNSUPPORTED_IMAGE_TYPE';
      return cb(error);
    }
    return cb(null, true);
  }
});

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
router.post('/crop/predict', asyncHandler(predictCrop));
router.get('/crop/model-info', asyncHandler(getCropModelInfo));
router.post('/agriculture/irrigation/recommend', asyncHandler(recommendIrrigation));

module.exports = router;
