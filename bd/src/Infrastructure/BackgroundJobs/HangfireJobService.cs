using Hangfire;
using System.Linq.Expressions;

namespace Infrastructure.BackgroundJobs
{

    public class HangfireJobService : IBackgroundJobService
    {
        private readonly IBackgroundJobClient _backgroundJobClient;

        public HangfireJobService(IBackgroundJobClient backgroundJobClient)
        {
            _backgroundJobClient = backgroundJobClient;
        }

        public string Enqueue<T>(Expression<Action<T>> methodCall)
        {
            return _backgroundJobClient.Enqueue(methodCall);
        }

        public string Schedule<T>(Expression<Action<T>> methodCall, TimeSpan delay)
        {
            return _backgroundJobClient.Schedule(methodCall, delay);
        }

        public void AddOrUpdateRecurringJob<T>(string jobId, Expression<Action<T>> methodCall, string cronExpression)
        {
            RecurringJob.AddOrUpdate<T>(jobId, methodCall, cronExpression);
        }

        public void RemoveRecurringJob(string jobId)
        {
            RecurringJob.RemoveIfExists(jobId);
        }

        public void ContinueJobWith<T>(string parentJobId, Expression<Action<T>> methodCall)
        {
            _backgroundJobClient.ContinueJobWith<T>(parentJobId, methodCall);
        }
    }
}
