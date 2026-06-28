import { TOTP } from '@otplib/totp'
import { NodeCryptoPlugin } from '@otplib/plugin-crypto-node'
import { ScureBase32Plugin } from '@otplib/plugin-base32-scure'
import encryption from '@adonisjs/core/services/encryption'

export const totp = new TOTP({
  crypto: new NodeCryptoPlugin(),
  base32: new ScureBase32Plugin(),
})

/**
 * Parse user-agent string and return device info
 * @param userAgent User-Agent header string
 * @returns Device name (e.g., "Chrome on Windows", "Safari on iPhone")
 */
export function parseDevice(userAgent: string): string {
  if (!userAgent) {
    return 'Unknown'
  }

  // Detect browser
  let browser = 'Unknown'
  if (userAgent.includes('Edg/')) {
    browser = 'Edge'
  } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
    browser = 'Chrome'
  } else if (userAgent.includes('Firefox/')) {
    browser = 'Firefox'
  } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
    browser = 'Safari'
  } else if (userAgent.includes('Opera/') || userAgent.includes('OPR/')) {
    browser = 'Opera'
  } else if (userAgent.includes('MSIE') || userAgent.includes('Trident/')) {
    browser = 'IE'
  }

  // Detect OS
  let os = 'Unknown'
  if (userAgent.includes('Windows')) {
    os = 'Windows'
  } else if (userAgent.includes('Mac OS X')) {
    os = 'macOS'
  } else if (userAgent.includes('Linux')) {
    os = 'Linux'
  } else if (userAgent.includes('Android')) {
    os = 'Android'
  } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
    os = 'iOS'
  }

  // Detect device type
  let deviceType = ''
  if (
    userAgent.includes('Mobile') ||
    userAgent.includes('Android') ||
    userAgent.includes('iPhone')
  ) {
    deviceType = 'Mobile'
  } else if (userAgent.includes('iPad') || userAgent.includes('Tablet')) {
    deviceType = 'Tablet'
  } else {
    deviceType = 'Desktop'
  }

  // Return concise device name
  if (browser === 'Unknown' && os === 'Unknown') {
    return deviceType || 'Unknown'
  }

  return `${browser} on ${os}`
}

export function makeTokenName(request: any): string {
  const userAgent = request.header('user-agent', '')
  const device = parseDevice(userAgent)
  const ip = request.ip()
  return `${device}(${ip})`
}

export function makeRefreshToken(data: { accessTokenId: string, userId: string }): string {
  return encryption.encrypt(data, { expiresIn: '30d' })
}

export function verifyRefreshToken(token: string): { accessTokenId: string, userId: string } {
  return encryption.decrypt(token) as { accessTokenId: string, userId: string }
}

export function makeAuthToken(data: { userId: string }): string {
  return encryption.encrypt(data, { expiresIn: '30d' })
}

export function verifyAuthToken(token: string): { userId: string } {
  return encryption.decrypt(token) as { userId: string }
}