import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateSchema } from '../src/middlewares/validate.js';
import { z } from 'zod';

describe('validateSchema Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      query: {},
      params: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    mockNext = vi.fn();
  });

  const testSchema = z.object({
    body: z.object({
      message: z.string().trim().min(1, "Message required")
    })
  });

  it('should call next() if validation passes', () => {
    mockReq.body.message = '  hello  ';
    const middleware = validateSchema(testSchema);
    middleware(mockReq, mockRes, mockNext);
    
    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should return 400 if validation fails with empty string', () => {
    mockReq.body.message = '   ';
    const middleware = validateSchema(testSchema);
    middleware(mockReq, mockRes, mockNext);
    
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: "Validation Error",
      details: [{ path: "body.message", message: "Message required" }]
    });
  });

  it('should return 400 without crashing if req.body is undefined', () => {
    mockReq.body = undefined;
    const middleware = validateSchema(testSchema);
    middleware(mockReq, mockRes, mockNext);
    
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
