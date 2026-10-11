// Replace this adapter with an authenticated backend transport when hardware is ready.
// No network, websocket, game command, or model execution is performed here.
export class DemoAdapter {
  constructor(){this.history=[];this.seen=new Set();}
  async submitSelection(selection){
    if(!this.seen.has(selection.id)){
      this.seen.add(selection.id);
      this.history.unshift({...selection,status:'not sent'});
      this.history=this.history.slice(0,5);
    }
    return {id:selection.id,status:'not sent'};
  }
}

// Sends confirmed selections to the game server, which runs that color's model on the arm
// (game/robot.py). Selection ids are deduplicated on the server too.
export class RobotAdapter extends DemoAdapter {
  constructor(fetchFn=(...a)=>fetch(...a)){super();this.fetch=fetchFn;this.robot=true;}
  async request(path,body){
    const response=await this.fetch(path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
    const status=await response.json().catch(()=>({message:`Server error ${response.status}`}));
    if(!response.ok)throw new Error(status.message||`Server error ${response.status}`);
    return status;
  }
  async submitSelection(selection){
    const status=await this.request('/api/robot/run',{id:selection.id,color:selection.color});
    if(!this.seen.has(selection.id)){
      this.seen.add(selection.id);
      this.history.unshift({...selection,status:'sent'});
      this.history=this.history.slice(0,5);
    }
    return {id:selection.id,status:'sent',robot:status};
  }
  status(){return this.request('/api/robot');}
  stop(){return this.request('/api/robot/stop',{});}
}
