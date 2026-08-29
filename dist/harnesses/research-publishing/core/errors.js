export class HarnessError extends Error {
    code;
    details;
    constructor(code, message, details) {
        super(message);
        this.name = 'HarnessError';
        this.code = code;
        this.details = details;
    }
}
//# sourceMappingURL=errors.js.map