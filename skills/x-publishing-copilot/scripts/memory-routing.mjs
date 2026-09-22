import { resolve } from 'node:path';
export function routeMemoryArgs(original, config, env = {}, input = null) {
  const args = [...original];
  if (args[0] !== 'memory') return {args, diagnostic:null};
  if (config && (config.schema_version !== 'research-memory-binding/v1' || !config.workspace || !config.track_id)) {
    throw new Error('Invalid research memory binding configuration');
  }
  const option = name => {const i=args.indexOf(name);return i < 0 ? null : args[i+1];};
  const add = (name,value) => {if(value && !args.includes(name))args.push(name,value);};
  let diagnostic = null;
  if (config) {
    const explicit = option('--workspace');
    const same = (a,b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
    const alias = explicit && (config.workspace_aliases ?? []).some(x=>same(x,explicit));
    if (alias) {
      const read = args[1] === 'doctor' || (args[1] === 'query' && ['plan','execute','status'].includes(args[2]));
      if (!read) throw new Error(`Memory actions require canonical workspace ${config.workspace}; source artifacts and approvals are workspace-bound.`);
      args[args.indexOf('--workspace')+1] = config.workspace;
      diagnostic = `Memory workspace: ${explicit} -> ${config.workspace}; track: ${config.track_id}`;
    }
    if (!explicit) {add('--workspace',config.workspace);diagnostic=`Memory workspace: ${config.workspace}; track: ${config.track_id}`;}
    if ((!explicit || alias || same(explicit,config.workspace)) && args[1] === 'query' && args[2] === 'plan') {
      const track = input?.track_id ?? input?.research_track;
      if (track && track !== config.track_id) throw new Error(`Memory track ${track} does not match configured ${config.track_id}; prepare a new Query Plan with the canonical track.`);
    }
  }
  add('--runtime-executable', env.LLM_WIKI_RUNTIME_EXECUTABLE ?? config?.runtime?.executable);
  add('--runtime-launcher', env.LLM_WIKI_RUNTIME_LAUNCHER ?? config?.runtime?.launcher);
  add('--runtime-version', env.LLM_WIKI_RUNTIME_VERSION ?? config?.runtime?.version);
  return {args,diagnostic};
}
