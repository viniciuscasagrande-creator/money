/** Host é o destino HTTP efetivo; NextURL normaliza IPs de loopback para localhost. */
export function sameRequestOrigin(origin:string|null,protocol:string,host:string){
  if(!origin)return true;
  try{
    if(!['http:','https:'].includes(protocol)||host!==host.trim())return false;
    const actual=new URL(origin),target=new URL(`${protocol}//${host}`);
    if(actual.username||actual.password||actual.pathname!=="/"||actual.search||actual.hash||target.username||target.password||target.pathname!=="/"||target.search||target.hash)return false;
    return actual.origin===target.origin;
  }catch{return false;}
}
