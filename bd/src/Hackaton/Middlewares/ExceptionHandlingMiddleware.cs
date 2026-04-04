using Domain.Exceptions;
using System.Text.Json;

namespace Web.Middlewares
{
    namespace Web.Middlewares
    {
        public class ExceptionHandlingMiddleware(
            RequestDelegate next,
            ILogger<ExceptionHandlingMiddleware> logger)
        {
            public async Task InvokeAsync(HttpContext context)
            {
                try
                {
                    await next(context);
                }
                catch (Exception ex)
                {
                    await HandleExceptionAsync(context, ex);
                }
            }

            private async Task HandleExceptionAsync(HttpContext context, Exception exception)
            {
                if (exception is IHttpException)
                    logger.LogInformation("Обработано исключение {ExceptionType} при запросе {Method} {Path}: {Message}",
                            exception.GetType().Name,
                            context.Request.Method,
                            context.Request.Path,
                            exception.Message);
                else
                    logger.LogError(exception, "Произошла ошибка при обработке запроса {Method} {Path}",
                        context.Request.Method,
                        context.Request.Path);

                var response = context.Response;
                response.ContentType = "application/json";

                var (statusCode, message) = GetStatusCodeAndMessage(exception);
                response.StatusCode = statusCode;

                var errorResponse = new
                {
                    StatusCode = statusCode,
                    Message = message,
                    Timestamp = DateTime.UtcNow,
                    Path = context.Request.Path,
                };

                var json = JsonSerializer.Serialize(errorResponse, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                await response.WriteAsync(json);
            }

            private static (int statusCode, string message) GetStatusCodeAndMessage(Exception exception)
            {
                return exception switch
                {
                    NotFoundException => (404, exception.Message),
                    UnauthorizedException => (401, exception.Message),
                    ConflictException => (409, exception.Message),
                    ValidationException => (400, exception.Message),
                    BadRequestException => (400, exception.Message),
                    _ => (500, "Внутренняя ошибка сервера")
                };
            }
        }
    }
}
