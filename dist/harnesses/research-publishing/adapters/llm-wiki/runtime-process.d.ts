import type { RuntimeProcessInput, RuntimeProcessOutput, RuntimeProcessRunner } from './runtime-protocol.js';
export declare class NodeRuntimeProcessRunner implements RuntimeProcessRunner {
    run(input: RuntimeProcessInput): Promise<RuntimeProcessOutput>;
}
