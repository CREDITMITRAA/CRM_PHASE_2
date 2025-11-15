/**
 * Reliable client IP extraction for proxy environments
 * Order of precedence:
 * 1. X-Forwarded-For (first IP in the chain)
 * 2. X-Real-IP
 * 3. CF-Connecting-IP (Cloudflare)
 * 4. True-Client-IP (Akamai)
 * 5. Remote address (fallback)
 */

const getClientIP = (req) => {
    // Debug log all relevant headers
    const ipHeaders = {
        'x-forwarded-for': req.headers['x-forwarded-for'],
        'x-real-ip': req.headers['x-real-ip'],
        'cf-connecting-ip': req.headers['cf-connecting-ip'],
        'true-client-ip': req.headers['true-client-ip'],
        'x-cluster-client-ip': req.headers['x-cluster-client-ip'],
        'remoteAddress': req.connection.remoteAddress,
        'socketRemoteAddress': req.socket.remoteAddress,
    };

    console.log('🔍 IP Headers Debug:', ipHeaders);

    // 1. Check X-Forwarded-For (most reliable in proxy chains)
    let xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
        // X-Forwarded-For format: "client, proxy1, proxy2"
        const ips = xForwardedFor.split(',').map(ip => ip.trim());
        const clientIP = ips[0];
        
        if (isValidIP(clientIP)) {
            console.log('✅ Using X-Forwarded-For IP:', clientIP);
            return normalizeIP(clientIP);
        }
    }

    // 2. Check X-Real-IP
    let xRealIP = req.headers['x-real-ip'];
    if (xRealIP && isValidIP(xRealIP)) {
        console.log('✅ Using X-Real-IP:', xRealIP);
        return normalizeIP(xRealIP);
    }

    // 3. Check other common proxy headers
    const otherHeaders = [
        'cf-connecting-ip',
        'true-client-ip',
        'x-cluster-client-ip'
    ];

    for (const header of otherHeaders) {
        const ip = req.headers[header];
        if (ip && isValidIP(ip)) {
            console.log(`✅ Using ${header}:`, ip);
            return normalizeIP(ip);
        }
    }

    // 4. Fallback to connection remote address
    const remoteAddr = req.connection.remoteAddress || req.socket.remoteAddress;
    if (remoteAddr && isValidIP(remoteAddr)) {
        console.log('⚠️ Using fallback remoteAddress:', remoteAddr);
        return normalizeIP(remoteAddr);
    }

    console.log('❌ No valid IP found, using default');
    return '0.0.0.0'; // Default fallback
};

const normalizeIP = (ip) => {
    // Remove IPv6 prefix if present
    if (ip && ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
};

const isValidIP = (ip) => {
    if (!ip || typeof ip !== 'string') return false;
    
    // Remove IPv6 prefix for validation
    const cleanIP = ip.startsWith('::ffff:') ? ip.substring(7) : ip;
    
    // Basic IP validation (IPv4)
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipv4Regex.test(cleanIP)) return false;
    
    // Validate each octet
    const octets = cleanIP.split('.');
    for (const octet of octets) {
        const num = parseInt(octet, 10);
        if (num < 0 || num > 255) return false;
    }
    
    return true;
};

// Middleware to attach IP to request
const attachClientIP = (req, res, next) => {
    req.clientIP = getClientIP(req);
    console.log('🎯 Final Client IP:', req.clientIP);
    next();
};

module.exports = {
    getClientIP,
    attachClientIP,
    isValidIP
};