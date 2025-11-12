import { ApiResponse } from '../models/types';

/**
 * Creates a standardized API response with timestamp
 */
export function createApiResponse<T>(
  success: boolean,
  message: string,
  data?: T,
  error?: string
): ApiResponse<T> {
  return {
    success,
    message,
    data,
    error,
    timestamp: new Date().toISOString()
  };
}

/**
 * Creates a success API response
 */
export function createSuccessResponse<T>(
  message: string,
  data?: T
): ApiResponse<T> {
  return createApiResponse(true, message, data);
}

/**
 * Creates an error API response
 */
export function createErrorResponse<T = null>(
  message: string,
  error?: string
): ApiResponse<T> {
  return createApiResponse(false, message, undefined as T, error);
}