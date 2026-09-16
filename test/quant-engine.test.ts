import test from 'node:test';import assert from 'node:assert/strict';
import{backtest,classify,defaultRisk,engineerFeatures,optimizePortfolio,sizePosition,syntheticCandles,walkForward}from'../src/quant-engine.js';

test('feature, signal and risk pipeline remains finite and exposure-capped',()=>{const rows=engineerFeatures(syntheticCandles('NIFTY',100));const row=rows.at(-1)!;const decision=classify(row),sizing=sizePosition(row,decision.signal,defaultRisk);assert.equal(rows.length,100);assert.ok(Number.isFinite(row.rsi));assert.ok(sizing.exposure<=defaultRisk.capital*defaultRisk.maxExposure);});
test('backtest and walk-forward produce reproducible metrics',()=>{const candles=syntheticCandles('NIFTY',260,42),a=backtest(candles,defaultRisk),b=backtest(candles,defaultRisk);assert.deepEqual(a,b);assert.equal(walkForward(candles,defaultRisk).length,4);assert.ok(a.finalEquity>0);});
test('portfolio optimizer returns normalized sparse weights',()=>{const result=optimizePortfolio([.12,.08,.15,.06],[[.04,.01,.01,0],[.01,.02,.01,0],[.01,.01,.06,.01],[0,0,.01,.01]],2,2);assert.ok(Math.abs(result.weights.reduce((a,b)=>a+b,0)-1)<.001);assert.ok(result.weights.filter(Boolean).length<=2);});
