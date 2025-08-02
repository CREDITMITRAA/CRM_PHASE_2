const crypto = require('crypto');

function verifyFacebookSignature(req, res, buf) {
  const signature = req.headers['x-hub-signature'];

  if (!signature) {
    throw new Error('Missing Facebook signature header');
  }

  const expectedSignature = `sha1=${crypto
    .createHmac('sha1', process.env.FB_APP_SECRET)
    .update(buf)
    .digest('hex')}`;

  if (signature !== expectedSignature) {
    throw new Error('Invalid Facebook signature');
  }
}

module.exports = verifyFacebookSignature;
