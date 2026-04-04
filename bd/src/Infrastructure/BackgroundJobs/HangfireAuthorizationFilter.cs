using Domain.Models;
using Hangfire.Dashboard;

namespace Infrastructure.BackgroundJobs
{

    public class HangfireAuthorizationFilter : IDashboardAuthorizationFilter
    {
        public bool Authorize(DashboardContext context)
        {

            var httpContext = context.GetHttpContext();

            if (httpContext.User?.Identity?.IsAuthenticated != true)
                return false;

            if (httpContext.User.IsInRole(Role.Admin.ToString()))
                return true;

            return false;
        }
    }
}