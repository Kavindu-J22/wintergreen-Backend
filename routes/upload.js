const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticateToken, requireRole } = require('../middleware/auth');
const { uploadToCloudinary, deleteFromCloudinary, getFileType } = require('../config/cloudinary');

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/temp';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// File filter for allowed file types
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images, PDFs, and documents are allowed.'), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// @route   POST /api/upload/single
// @desc    Upload single file
// @access  Private (SuperAdmin, Admin, Moderator)
router.post('/single', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Upload to Cloudinary
    const cloudinaryResult = await uploadToCloudinary(req.file, 'wintergreen-academy/documents');
    
    // Clean up temporary file
    fs.unlinkSync(req.file.path);

    // Determine file type
    const fileType = getFileType(cloudinaryResult.format);

    res.json({
      message: 'File uploaded successfully',
      file: {
        name: req.file.originalname,
        url: cloudinaryResult.url,
        publicId: cloudinaryResult.publicId,
        type: fileType,
        size: cloudinaryResult.bytes,
        format: cloudinaryResult.format
      }
    });
  } catch (error) {
    // Clean up temporary file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    console.error('File upload error:', error);
    res.status(500).json({ 
      message: 'File upload failed', 
      error: error.message 
    });
  }
});

// @route   POST /api/upload/multiple
// @desc    Upload multiple files
// @access  Private (SuperAdmin, Admin, Moderator)
router.post('/multiple', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), upload.array('files', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const uploadPromises = req.files.map(async (file) => {
      try {
        const cloudinaryResult = await uploadToCloudinary(file, 'wintergreen-academy/documents');
        
        // Clean up temporary file
        fs.unlinkSync(file.path);

        return {
          name: file.originalname,
          url: cloudinaryResult.url,
          publicId: cloudinaryResult.publicId,
          type: getFileType(cloudinaryResult.format),
          size: cloudinaryResult.bytes,
          format: cloudinaryResult.format
        };
      } catch (error) {
        // Clean up temporary file if it exists
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw error;
      }
    });

    const uploadedFiles = await Promise.all(uploadPromises);

    res.json({
      message: 'Files uploaded successfully',
      files: uploadedFiles
    });
  } catch (error) {
    // Clean up any remaining temporary files
    if (req.files) {
      req.files.forEach(file => {
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }
    
    console.error('Multiple file upload error:', error);
    res.status(500).json({ 
      message: 'File upload failed', 
      error: error.message 
    });
  }
});

// @route   DELETE /api/upload/:publicId
// @desc    Delete file from Cloudinary
// @access  Private (SuperAdmin, Admin, Moderator)
router.delete('/:publicId', authenticateToken, requireRole('superAdmin', 'admin', 'moderator'), async (req, res) => {
  try {
    const { publicId } = req.params;
    
    // Decode the public ID (it might be URL encoded)
    const decodedPublicId = decodeURIComponent(publicId);
    
    const result = await deleteFromCloudinary(decodedPublicId);
    
    if (result.result === 'ok') {
      res.json({ message: 'File deleted successfully' });
    } else {
      res.status(404).json({ message: 'File not found or already deleted' });
    }
  } catch (error) {
    console.error('File delete error:', error);
    res.status(500).json({ 
      message: 'File deletion failed', 
      error: error.message 
    });
  }
});

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 10MB.' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: 'Too many files. Maximum is 5 files.' });
    }
  }
  
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({ message: error.message });
  }
  
  res.status(500).json({ message: 'Upload error', error: error.message });
});

module.exports = router;
