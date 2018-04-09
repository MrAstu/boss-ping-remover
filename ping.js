/**
  Ping.js fix by undefined#3394 - Skill-Prediction by PinkiePie: https://github.com/pinkipi/skill-prediction
  => Retrieve your ping needed by skill-prediction but using passive methods.
  => Less accurate ping than original but also prevent you from getting banned for spamming packets to server.
  => Remember to set SKILL_RETRY_COUNT = 0 in skills.js if you want to use safe-proxy together with skill-prediction.
*/
const path = require('path')
const config = require(path.join(__dirname, 'config.json'))
const pingLimit = config.pingSpikesLimit;
const PING_LIMIT_MIN = config.pingSpikesMin;
const PING_LIMIT_MAX = config.pingSpikesMax;
const PING_HISTORY_MAX = config.pingHistoryMax;

class Ping {
  constructor(dispatch) {
    this.min = this.max = this.avg = 0;
    this.history = [];
  
    const updatePing = ping => {
      if(pingLimit && ((ping <= PING_LIMIT_MIN) || (ping >= PING_LIMIT_MAX))) return;
      this.history.push(ping);
      if(this.history.length > PING_HISTORY_MAX) this.history.shift();
      
      this.min = this.max = this.history[0];
      this.avg = 0;

      for(let p of this.history) {
        if(p < this.min) this.min = p;
        else if(p > this.max) this.max = p;
        
        this.avg += p;
      }

      this.avg /= this.history.length;
    };

    //---
    
    let gameId;
    this.last = 0;
    let pingStack = {};

    const pingStart = id => {
      if(!id) return;
      pingStack[id] = Date.now();
    };
    const pingEnd = id => {
      if(!pingStack[id]) return;
      this.last = Date.now() - pingStack[id];
      updatePing(this.last);
      delete pingStack[id];
    };

    const skillId = id => {
      return ((id > 0x4000000) ? id - 0x4000000 : id);
    };
    
    dispatch.hook('S_LOGIN', 10, e => { ({gameId} = e); });

    const skillHook = e => {
      pingStart(skillId(e.skill));
    };

    for(let packet of [
      ['C_START_SKILL', 5],
      ['C_START_TARGETED_SKILL', 4],
      ['C_START_COMBO_INSTANT_SKILL', 2],
      ['C_START_INSTANCE_SKILL', 3],
      ['C_START_INSTANCE_SKILL_EX', 3],
      //['C_PRESS_SKILL', 1],
      ['C_NOTIMELINE_SKILL', 1], //not sure about this one
      ['C_CAN_LOCKON_TARGET', 1],
    ]) dispatch.hook(packet[0], packet[1], { /*filter: { fake: false, modified: false },*/ order: 1000 }, skillHook);

    dispatch.hook('C_CANCEL_SKILL', 1, e => {
      delete pingStack[skillId(e.skill)];
    });

    const actionHook = e => {
      if(e.gameId && !e.gameId.equals(gameId)) return;
      pingEnd(skillId(e.skill));
    };

    for(let packet of [
      ['S_ACTION_STAGE', 4],
      ['S_CANNOT_START_SKILL', 1],
      ['S_CAN_LOCKON_TARGET', 1],
      //['S_INSTANT_DASH', 3], //not sure about this, often delayed extra 25ms
      //['S_INSTANT_MOVE', 3], //not sure about this, often delayed extra 25ms
    ]) dispatch.hook(packet[0], packet[1], { filter: { fake: false, modified: false, silenced: null }, order: -1000 }, actionHook);

    dispatch.hook('C_REQUEST_GAMESTAT_PING', 1, () => {
      setTimeout(() => { dispatch.toClient('S_RESPONSE_GAMESTAT_PONG', 1); }, this.last);
      return false;
    });
    
  }
}

let map = new WeakMap();
module.exports = function Require(dispatch) {
  if(map.has(dispatch.base)) return map.get(dispatch.base);

  let ping = new Ping(dispatch);
  map.set(dispatch.base, ping);
  return ping;
}
