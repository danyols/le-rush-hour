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
