export class AppError extends Error {
  readonly statusCode: number;
  readonly details: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.details = details ?? message;
  }
}

export class BadRequestError extends AppError {
  constructor(details: unknown) {
    super(400, "Bad Request", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string) {
    super(401, message);
  }
}

/** Đã biết anh là ai, nhưng anh không được phép. Khác hẳn 401 (chưa biết anh là ai). */
export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(404, message);
  }
}

/**
 * Yêu cầu hợp lệ về cú pháp nhưng sai về trạng thái game: gieo hạt vào ô đã có
 * cây, thu hoạch cây chưa chín, mua đồ không đủ tiền. Tách khỏi 400 để client
 * phân biệt "tôi gửi sai" với "lúc này chưa làm được".
 */
export class UnprocessableError extends AppError {
  constructor(message: string) {
    super(422, message);
  }
}

/**
 * Máy chủ hiểu yêu cầu nhưng lúc này không phục vụ được vì một thứ BÊN NGOÀI:
 * chưa cấu hình, hoặc dịch vụ thứ ba không trả lời (JWKS của Google). Tách khỏi
 * 500 để client biết thử lại là có cơ may, còn log biết đây không phải bug.
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string) {
    super(503, message);
  }
}
