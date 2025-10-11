// utils/s3PresignedUrl.js
const AWS = require('aws-sdk');

// Configure AWS SDK
AWS.config.update({
  region: process.env.AWS_REGION || 'ap-south-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();

// Generate presigned URL for S3 object
const generatePresignedUrl = async (s3Key, bucketName = null, expiresIn = 3600) => {
  try {
    if (!s3Key) return null;

    // Extract bucket name from s3Key if full URL is provided
    let finalBucketName = bucketName || process.env.AWS_S3_BUCKET_NAME;
    let finalKey = s3Key;

    // If s3Key is a full URL, extract bucket and key
    if (s3Key.startsWith('https://')) {
      const bucketInfo = extractBucketAndKeyFromUrl(s3Key);
      if (bucketInfo) {
        finalBucketName = bucketInfo.bucket;
        finalKey = bucketInfo.key;
      }
    }

    // Decode the key to handle encoded characters properly
    finalKey = decodeURIComponent(finalKey);

    const params = {
      Bucket: finalBucketName,
      Key: finalKey,
      Expires: expiresIn // URL expires in seconds
    };

    const presignedUrl = await s3.getSignedUrlPromise('getObject', params);
    return presignedUrl;

  } catch (error) {
    console.error('Error generating presigned URL:', error);
    return null;
  }
};

// Extract bucket and key from S3 URL
const extractBucketAndKeyFromUrl = (s3Url) => {
  if (!s3Url) return null;
  
  try {
    const url = new URL(s3Url);
    
    // Handle different S3 URL formats:
    // 1. https://bucket-name.s3.region.amazonaws.com/key
    // 2. https://s3.region.amazonaws.com/bucket-name/key
    // 3. https://bucket-name.s3.amazonaws.com/key
    
    const hostParts = url.hostname.split('.');
    
    if (hostParts.includes('s3') && hostParts.includes('amazonaws')) {
      if (hostParts[0] !== 's3') {
        // Format 1 & 3: bucket-name.s3...
        return {
          bucket: hostParts[0],
          key: url.pathname.substring(1) // Keep the key encoded for now
        };
      } else {
        // Format 2: s3.region.amazonaws.com/bucket-name/key
        const pathParts = url.pathname.substring(1).split('/');
        return {
          bucket: pathParts[0],
          key: pathParts.slice(1).join('/') // Keep the key encoded for now
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing S3 URL:', error);
    return null;
  }
};

// Alternative method using v2's built-in URL parsing
const getPresignedUrlFromFullUrl = async (fullS3Url, expiresIn = 3600) => {
  try {
    if (!fullS3Url) return null;

    const bucketInfo = extractBucketAndKeyFromUrl(fullS3Url);
    if (!bucketInfo) return null;

    // Decode the key to handle spaces and special characters properly
    const decodedKey = decodeURIComponent(bucketInfo.key);

    const params = {
      Bucket: bucketInfo.bucket,
      Key: decodedKey, // Use decoded key
      Expires: expiresIn
    };

    console.log('Generating presigned URL for:', {
      bucket: bucketInfo.bucket,
      originalKey: bucketInfo.key,
      decodedKey: decodedKey,
      fullUrl: fullS3Url
    });

    const presignedUrl = await s3.getSignedUrlPromise('getObject', params);
    return presignedUrl;

  } catch (error) {
    console.error('Error generating presigned URL from full URL:', error);
    return null;
  }
};

module.exports = {
  generatePresignedUrl,
  extractBucketAndKeyFromUrl,
  getPresignedUrlFromFullUrl
};