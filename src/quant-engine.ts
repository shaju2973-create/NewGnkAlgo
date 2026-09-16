export type Candle={time:string;open:number;high:number;low:number;close:number;volume:number};
export type Signal='BUY'|'SELL'|'HOLD';
export type FeatureRow=Candle&{emaFast:number;emaSlow:number;rsi:number;atr:number;vwap:number;momentum:number;volumeRatio:number};
export type RiskConfig={capital:number;riskPerTrade:number;maxExposure:number;atrStop:number;rewardRisk:number;maxDrawdown:number};

const round=(value:number,digits=2)=>Number(value.toFixed(digits));
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;

/** Deterministic synthetic feed for demos/tests. Live adapters must implement the same Candle contract. */
export function syntheticCandles(symbol='NIFTY',count=260,seed=17):Candle[]{
  let state=seed>>>0,price=symbol.includes('BANK')?48000:22500;
  const random=()=>((state=(state*1664525+1013904223)>>>0)/4294967296)-.5;
  const start=Date.UTC(2025,0,1,3,45);
  return Array.from({length:count},(_,i)=>{
    const cycle=Math.sin(i/17)*.0018,shock=random()*.008,open=price;
    const close=Math.max(1,open*(1+.00035+cycle+shock));
    const spread=Math.abs(random())*.004*open;
    price=close;
    return{time:new Date(start+i*86400000).toISOString(),open:round(open),high:round(Math.max(open,close)+spread),low:round(Math.min(open,close)-spread),close:round(close),volume:Math.round(900000+Math.abs(random())*1100000)};
  });
}

export function engineerFeatures(candles:Candle[],fast=12,slow=26,rsiPeriod=14,atrPeriod=14):FeatureRow[]{
  if(!candles.length)return[];
  const kFast=2/(fast+1),kSlow=2/(slow+1);let emaFast=candles[0]!.close,emaSlow=emaFast,cumPV=0,cumVolume=0;
  const gains:number[]=[],losses:number[]=[],trs:number[]=[],volumes:number[]=[];
  return candles.map((c,i)=>{
    const previous=candles[Math.max(0,i-1)]!;const change=c.close-previous.close;
    gains.push(Math.max(change,0));losses.push(Math.max(-change,0));
    const tr=Math.max(c.high-c.low,Math.abs(c.high-previous.close),Math.abs(c.low-previous.close));trs.push(tr);volumes.push(c.volume);
    if(i){emaFast=c.close*kFast+emaFast*(1-kFast);emaSlow=c.close*kSlow+emaSlow*(1-kSlow);}
    cumPV+=((c.high+c.low+c.close)/3)*c.volume;cumVolume+=c.volume;
    const avgGain=mean(gains.slice(-rsiPeriod)),avgLoss=mean(losses.slice(-rsiPeriod));
    const rsi=avgLoss===0?100:100-(100/(1+avgGain/avgLoss));
    const base=candles[Math.max(0,i-10)]!.close;
    return{...c,emaFast:round(emaFast),emaSlow:round(emaSlow),rsi:round(rsi),atr:round(mean(trs.slice(-atrPeriod))),vwap:round(cumPV/cumVolume),momentum:round((c.close/base-1)*100),volumeRatio:round(c.volume/mean(volumes.slice(-20)))};
  });
}

export function classify(row:FeatureRow):{signal:Signal;score:number;reasons:string[]}{
  let score=0;const reasons:string[]=[];
  if(row.emaFast>row.emaSlow){score++;reasons.push('fast EMA above slow EMA');}else{score--;reasons.push('fast EMA below slow EMA');}
  if(row.close>row.vwap){score++;reasons.push('price above VWAP');}else score--;
  if(row.rsi<35){score++;reasons.push('RSI oversold');}else if(row.rsi>70){score--;reasons.push('RSI overbought');}
  if(row.momentum>0)score++;else score--;
  if(row.volumeRatio>1.35){score+=Math.sign(score)||1;reasons.push('volume confirmation');}
  return{signal:score>=2?'BUY':score<=-2?'SELL':'HOLD',score,reasons};
}

export function sizePosition(row:FeatureRow,signal:Signal,config:RiskConfig){
  if(signal==='HOLD')return{quantity:0,entry:row.close,stopLoss:row.close,target:row.close,riskAmount:0,exposure:0};
  const riskAmount=config.capital*config.riskPerTrade,stopDistance=Math.max(row.atr*config.atrStop,row.close*.002);
  const byRisk=Math.floor(riskAmount/stopDistance),byExposure=Math.floor(config.capital*config.maxExposure/row.close),quantity=Math.max(0,Math.min(byRisk,byExposure));
  const direction=signal==='BUY'?1:-1;
  return{quantity,entry:row.close,stopLoss:round(row.close-direction*stopDistance),target:round(row.close+direction*stopDistance*config.rewardRisk),riskAmount:round(quantity*stopDistance),exposure:round(quantity*row.close)};
}

export function backtest(candles:Candle[],config:RiskConfig){
  const rows=engineerFeatures(candles);let cash=config.capital,peak=cash,position:{side:1|-1;quantity:number;entry:number;stop:number;target:number}|null=null;
  const trades:{entry:number;exit:number;side:'BUY'|'SELL';pnl:number;reason:string}[]=[],curve:number[]=[];
  for(let i=30;i<rows.length;i++){
    const row=rows[i]!;
    if(position){let exit:number|undefined,reason='signal';
      if(position.side===1&&row.low<=position.stop||position.side===-1&&row.high>=position.stop){exit=position.stop;reason='stop';}
      else if(position.side===1&&row.high>=position.target||position.side===-1&&row.low<=position.target){exit=position.target;reason='target';}
      else if(classify(row).signal===(position.side===1?'SELL':'BUY'))exit=row.close;
      if(exit!==undefined){const pnl=(exit-position.entry)*position.quantity*position.side;cash+=pnl;trades.push({entry:position.entry,exit:round(exit),side:position.side===1?'BUY':'SELL',pnl:round(pnl),reason});position=null;}
    }
    if(!position){const {signal}=classify(row),sizing=sizePosition(row,signal,config);if(signal!=='HOLD'&&sizing.quantity)position={side:signal==='BUY'?1:-1,quantity:sizing.quantity,entry:row.close,stop:sizing.stopLoss,target:sizing.target};}
    const equity=cash+(position?(row.close-position.entry)*position.quantity*position.side:0);peak=Math.max(peak,equity);curve.push(round(equity));
    if((peak-equity)/peak>=config.maxDrawdown){position=null;break;}
  }
  const wins=trades.filter(t=>t.pnl>0),losses=trades.filter(t=>t.pnl<0),returns=curve.slice(1).map((v,i)=>v/curve[i]!-1),avg=mean(returns),sd=Math.sqrt(mean(returns.map(x=>(x-avg)**2)));
  return{initialCapital:config.capital,finalEquity:round(curve.at(-1)??cash),netPnl:round((curve.at(-1)??cash)-config.capital),returnPct:round(((curve.at(-1)??cash)/config.capital-1)*100),trades:trades.length,winRate:round(trades.length?wins.length/trades.length*100:0),profitFactor:round(Math.abs(losses.reduce((a,t)=>a+t.pnl,0))?wins.reduce((a,t)=>a+t.pnl,0)/Math.abs(losses.reduce((a,t)=>a+t.pnl,0)):0),sharpe:round(sd?avg/sd*Math.sqrt(252):0),equityCurve:curve,tradeLog:trades};
}

export function walkForward(candles:Candle[],config:RiskConfig,folds=4){
  const foldSize=Math.floor(candles.length/(folds+1));
  return Array.from({length:folds},(_,i)=>{const trainEnd=foldSize*(i+1),testEnd=Math.min(candles.length,trainEnd+foldSize);const result=backtest(candles.slice(Math.max(0,trainEnd-80),testEnd),config);return{fold:i+1,trainBars:trainEnd,testBars:testEnd-trainEnd,returnPct:result.returnPct,winRate:result.winRate,trades:result.trades};});
}

/** Small QAOA-style binary search baseline; replace with a hardware provider without changing the API. */
export function optimizePortfolio(expectedReturns:number[],covariance:number[][],riskAversion=3,maxAssets=3){
  const n=expectedReturns.length;if(n>20)throw new Error('portfolio_too_large_for_reference_optimizer');let best={mask:0,objective:-Infinity};
  for(let mask=1;mask<2**n;mask++){const selected=Array.from({length:n},(_,i)=>(mask>>i)&1);const count=selected.reduce((a,b)=>a+b,0);if(count>maxAssets)continue;const weights=selected.map(x=>x/count);const gain=weights.reduce((a,w,i)=>a+w*expectedReturns[i]!,0);let risk=0;for(let i=0;i<n;i++)for(let j=0;j<n;j++)risk+=weights[i]!*weights[j]!*covariance[i]![j]!;const objective=gain-riskAversion*risk;if(objective>best.objective)best={mask,objective};}
  const count=Array.from({length:n},(_,i)=>(best.mask>>i)&1).reduce((a,b)=>a+b,0);return{weights:Array.from({length:n},(_,i)=>((best.mask>>i)&1)?round(1/count,4):0),objective:round(best.objective,6),method:'QAOA-compatible binary objective (classical reference)'};
}

export const defaultRisk:RiskConfig={capital:1_000_000,riskPerTrade:.01,maxExposure:.25,atrStop:1.5,rewardRisk:2,maxDrawdown:.12};
