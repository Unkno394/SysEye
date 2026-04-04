using Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Infrastructure.Extensions
{
    public static class DbContextTransactionExtensions
    {
        /// <summary>
        /// Выполняет указанное действие в рамках транзакции базы данных с поддержкой повторных попыток при временных сбоях
        /// </summary>
        /// <typeparam name="T">Тип возвращаемого значения</typeparam>
        /// <param name="dbContext">Контекст базы данных</param>
        /// <param name="action">Асинхронное действие, которое будет выполнено в транзакции. Должно возвращать результат типа T</param>
        /// <param name="configureOptions">Опциональная конфигурация параметров транзакции</param>
        /// <param name="cancellationToken">Токен для отмены операции</param>
        public static async Task<T> WithTransactionAsync<T>(
            this DbContext dbContext,
            Func<Task<T>> action,
            CancellationToken cancellationToken = default,
            Action<TransactionOptions>? configureOptions = default)
        {
            var options = new TransactionOptions();
            configureOptions?.Invoke(options);

            var strategy = dbContext.Database.CreateExecutionStrategy();

            return await strategy.ExecuteAsync(async () =>
            {
                var executionCount = 0;
                var maxRetries = options.MaxRetryCount;

                while (true)
                {
                    try
                    {
                        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

                        try
                        {
                            var result = await action();
                            await transaction.CommitAsync(cancellationToken);
                            return result;
                        }
                        catch
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            throw;
                        }
                    }
                    catch (Exception ex) when (IsRetryableException(ex) && executionCount < maxRetries)
                    {
                        executionCount++;

                        if (options.EnableRetryOnFailure)
                        {
                            var delay = CalculateRetryDelay(executionCount, options);
                            await Task.Delay(delay, cancellationToken);
                        }
                    }
                }
            });
        }

        /// <summary>
        /// Выполняет указанное действие в рамках транзакции базы данных с поддержкой повторных попыток при временных сбоях
        /// </summary>
        /// <param name="dbContext">Контекст базы данных</param>
        /// <param name="action">Асинхронное действие, которое будет выполнено в транзакции (без возврата значения)</param>
        /// <param name="configureOptions">Опциональная конфигурация параметров транзакции</param>
        /// <param name="cancellationToken">Токен для отмены операции</param>
        public static async Task WithTransactionAsync(
            this DbContext dbContext,
            Func<Task> action,
            CancellationToken cancellationToken = default,
            Action<TransactionOptions>? configureOptions = default)
        {
            var options = new TransactionOptions();
            configureOptions?.Invoke(options);

            var strategy = dbContext.Database.CreateExecutionStrategy();

            await strategy.ExecuteAsync(async () =>
            {
                var executionCount = 0;
                var maxRetries = options.MaxRetryCount;

                while (true)
                {
                    try
                    {
                        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);

                        try
                        {
                            await action();
                            await transaction.CommitAsync(cancellationToken);
                            return;
                        }
                        catch
                        {
                            await transaction.RollbackAsync(cancellationToken);
                            throw;
                        }
                    }
                    catch (Exception ex) when (IsRetryableException(ex) && executionCount < maxRetries)
                    {
                        executionCount++;

                        if (options.EnableRetryOnFailure)
                        {
                            var delay = CalculateRetryDelay(executionCount, options);
                            await Task.Delay(delay, cancellationToken);
                        }
                    }
                }
            });
        }

        private static bool IsRetryableException(Exception ex)
        {
            return ex is DbUpdateException
                || ex is NpgsqlException
                || (ex.InnerException != null && IsRetryableException(ex.InnerException));
        }

        /// <summary>
        /// Экспоненциальная задержка
        /// </summary>
        /// <param name="retryCount">Количество попыток</param>
        /// <param name="options">Настройки транзакции</param>
        /// <returns>Задержка в мс</returns>
        private static TimeSpan CalculateRetryDelay(int retryCount, TransactionOptions options)
        {
            if (options.UseExponentialBackoff)
            {
                var exponentialDelay = Math.Pow(2, retryCount) * 100;
                return TimeSpan.FromMilliseconds(exponentialDelay);
            }

            return TimeSpan.FromMilliseconds(options.FixedDelayMs);
        }
    }
}
