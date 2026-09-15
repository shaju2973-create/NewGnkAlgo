import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const sha256 = (value:string) => createHash('sha256').update(value).digest();
const randomToken = () => randomBytes(32).toString('base64url');

export class Vault {
  constructor(private ring:Record<string,string>, private active:string) {}
  private key(version:string) { const key=Buffer.from(this.ring[version]??'','base64'); if(key.length!==32) throw new Error('Invalid AES data key'); return key; }
  encrypt(plain:string,aad:string) { const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',this.key(this.active),iv); c.setAAD(Buffer.from(aad)); const body=Buffer.concat([c.update(plain,'utf8'),c.final()]); return {ciphertext:[iv,c.getAuthTag(),body].map(v=>v.toString('base64url')).join('.'),keyVersion:this.active}; }
  decrypt(value:string,version:string,aad:string) { const parts=value.split('.').map(v=>Buffer.from(v,'base64url')); if(parts.length!==3)throw new Error('Invalid ciphertext'); const [iv,tag,body]=parts as [Buffer,Buffer,Buffer]; const d=createDecipheriv('aes-256-gcm',this.key(version),iv); d.setAAD(Buffer.from(aad));d.setAuthTag(tag);return Buffer.concat([d.update(body),d.final()]).toString('utf8'); }
}
export const security={sha256,randomToken};
