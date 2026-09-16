import test from 'node:test'; import assert from 'node:assert/strict';
import { hashPassword,verifyPassword,validatePassword,signAccessToken,verifyJwt } from '../src/auth.js';
process.env.JWT_SECRET=Buffer.alloc(32,9).toString('base64');
test('password hashing verifies only the correct password',async()=>{const hash=await hashPassword('StrongPassword123');assert.equal(await verifyPassword('StrongPassword123',hash),true);assert.equal(await verifyPassword('wrong password',hash),false);assert.equal(validatePassword('short'),'password_must_be_12_to_128_characters');});
test('access JWT has expected subject and purpose',async()=>{const token=await signAccessToken({id:'00000000-0000-4000-8000-000000000001',email:'user@example.com',role:'user'});const {payload}=await verifyJwt(token,'gnkalgo-api');assert.equal(payload.sub,'00000000-0000-4000-8000-000000000001');assert.equal(payload.token_use,'access');});
