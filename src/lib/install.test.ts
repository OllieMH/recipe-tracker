import { describe, expect, it } from 'vitest'
import { detectPlatform } from './install'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0]',
  iphoneGoogleApp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.0 Mobile/15E148 Safari/604.1',
  iphoneBareWebView:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  ipadDesktopMode:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
}

describe('detectPlatform', () => {
  it('recognises iPhone browsers that offer Add to Home Screen', () => {
    expect(detectPlatform(UA.iphoneSafari)).toBe('ios')
    expect(detectPlatform(UA.iphoneChrome)).toBe('ios')
  })

  it('recognises in-app browsers on iPhone', () => {
    expect(detectPlatform(UA.iphoneFacebook)).toBe('ios-webview')
    expect(detectPlatform(UA.iphoneGoogleApp)).toBe('ios-webview')
    expect(detectPlatform(UA.iphoneBareWebView)).toBe('ios-webview')
  })

  it('treats an iPad asking for the desktop site as iOS, a real Mac as desktop', () => {
    expect(detectPlatform(UA.ipadDesktopMode, 5)).toBe('ios')
    expect(detectPlatform(UA.ipadDesktopMode, 0)).toBe('desktop')
  })

  it('recognises Android and desktop', () => {
    expect(detectPlatform(UA.androidChrome)).toBe('android')
    expect(detectPlatform(UA.windowsChrome)).toBe('desktop')
  })
})
