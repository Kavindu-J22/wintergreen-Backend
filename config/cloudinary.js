const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dovhwyntb',
  api_key: process.env.CLOUDINARY_API_KEY || '',
  api_secret: process.env.CLOUDINARY_API_SECRET || '',
});

// Upload preset configuration
const UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || 'testup';

// Helper function to upload file to Cloudinary
const uploadToCloudinary = async (file, folder = 'wintergreen-academy') => {
  try {
    // Check if we have API credentials or if we should use unsigned upload
    const hasCredentials = process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET;

    let uploadOptions = {
      resource_type: 'auto', // Automatically detect file type
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt'],
    };

    if (hasCredentials) {
      // Use signed upload with folder
      uploadOptions.folder = folder;
      uploadOptions.upload_preset = UPLOAD_PRESET;
    } else {
      // Use unsigned upload (requires upload preset to be configured as unsigned in Cloudinary)
      uploadOptions.upload_preset = UPLOAD_PRESET;
      uploadOptions.unsigned = true;
    }

    const result = await cloudinary.uploader.upload(file.path, uploadOptions);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      resourceType: result.resource_type,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    if (error.message && error.message.includes('api_key')) {
      throw new Error('Cloudinary API credentials are missing. Please set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in your .env file, or configure your upload preset as unsigned.');
    }
    throw new Error(`Failed to upload file to Cloudinary: ${error.message}`);
  }
};

// Helper function to delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Failed to delete file from Cloudinary');
  }
};

// Helper function to get file type from format
const getFileType = (format) => {
  const imageFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const documentFormats = ['pdf', 'doc', 'docx', 'txt', 'rtf'];
  
  if (imageFormats.includes(format.toLowerCase())) {
    return 'image';
  } else if (documentFormats.includes(format.toLowerCase())) {
    return format.toLowerCase() === 'pdf' ? 'pdf' : 'document';
  } else {
    return 'document';
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  getFileType,
  UPLOAD_PRESET
};
