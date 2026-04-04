using System.Linq.Expressions;

namespace Infrastructure.BackgroundJobs
{
    public interface IBackgroundJobService
    {
        /// <summary>
        /// Задача выполняется сразу
        /// </summary>
        /// <typeparam name="T">Тип джоба</typeparam>
        /// <param name="methodCall">Метод для выполнения</param>
        /// <returns>ID задачи</returns>
        string Enqueue<T>(Expression<Action<T>> methodCall);

        /// <summary>
        /// Задача с отложенным началом
        /// </summary>
        /// <typeparam name="T">Тип джоба</typeparam>
        /// <param name="methodCall">Метод для выполнения</param>
        /// <param name="delay">Задержка</param>
        /// <returns>ID задачи</returns>
        string Schedule<T>(Expression<Action<T>> methodCall, TimeSpan delay);

        /// <summary>
        /// Периодическая задача (cron)
        /// </summary>
        /// <typeparam name="T">Тип джоба</typeparam>
        /// <param name="jobId">ID задачи</param>
        /// <param name="methodCall">Метод для выполнения</param>
        /// <param name="cronExpression">CRON выражение</param>
        void AddOrUpdateRecurringJob<T>(string jobId, Expression<Action<T>> methodCall, string cronExpression);

        /// <summary>
        /// Удалить периодическую задачу
        /// </summary>
        /// <param name="jobId">ID задачи</param>
        void RemoveRecurringJob(string jobId);

        /// <summary>
        /// Продолжение после выполнения другой задачи
        /// </summary>
        /// <typeparam name="T">Тип джоба</typeparam>
        /// <param name="parentJobId">ID родительской задачи</param>
        /// <param name="methodCall">Метод для выполнения</param>
        void ContinueJobWith<T>(string parentJobId, Expression<Action<T>> methodCall);
    }
}