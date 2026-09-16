import { randomBytes, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { security } from './security.js';

const N=16384,r=8,p=1,keyLength=64;
const scrypt=(password:string,salt:Buffer,length:number,options:{N:number;r:number;p:number;maxmem:number})=>new Promise<Buffer>((resolve,reject)=>rawScrypt(password,salt,length,options,(error,key)=>error?reject(error):resolve(key)));

export async function hashPassword(password:string) {
  const salt=randomBytes(16); const derived=await scrypt(password,salt,keyLength,{N,r,p,maxmem:64*1024*1024});
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}
export async function verifyPassword(password:string,stored:string) {
  const [kind,nv,rv,pv,saltv,hashv]=stored.split('$'); if(kind!=='scrypt'||!nv||!rv||!pv||!saltv||!hashv)return false;
  const expected=Buffer.from(hashv,'base64url'); const actual=await scrypt(password,Buffer.from(saltv,'base64url'),expected.length,{N:Number(nv),r:Number(rv),p:Number(pv),maxmem:64*1024*1024});
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
export function validatePassword(value:unknown) {
  if(typeof value!=='string'||value.length<12||value.length>128)return 'password_must_be_12_to_128_characters';
  if(!/[a-z]/.test(value)||!/[A-Z]/.test(value)||!/[0-9]/.test(value))return 'password_requires_upper_lower_and_number';
  return null;
}
const secret=()=>new TextEncoder().encode(process.env.JWT_SECRET!);
export async function signAccessToken(user:{id:string;email:string;role:string}) {
  return new SignJWT({email:user.email,role:user.role,token_use:'access'}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuer('gnkalgo').setAudience('gnkalgo-api').setIssuedAt().setExpirationTime('15m').sign(secret());
}
export async function signRefreshToken(userId:string,jti:string,familyId:string) {
  return new SignJWT({token_use:'refresh',family_id:familyId}).setProtectedHeader({alg:'HS256'}).setSubject(userId).setJti(jti).setIssuer('gnkalgo').setAudience('gnkalgo-refresh').setIssuedAt().setExpirationTime('30d').sign(secret());
}
export async function verifyJwt(token:string,audience:'gnkalgo-api'|'gnkalgo-refresh') {
  return jwtVerify(token,secret(),{issuer:'gnkalgo',audience,algorithms:['HS256']});
}
export const hashToken=(token:string)=>security.sha256(token);
