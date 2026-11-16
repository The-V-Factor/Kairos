import { IGPSPORT, sessionKey } from './igpsport.mjs';

// Provider selection and common route preview stay separate from provider API details.
export const routeProviders = [{ id: 'igpsport-cn', name: 'iGPSPORT', caption: '中国站路书', sessionKey, createClient: () => new IGPSPORT() }];
