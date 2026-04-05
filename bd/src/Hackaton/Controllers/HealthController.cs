using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet("/heartbeat")]
    public async Task<ActionResult<DateTime>> Heartbeat() => Ok(DateTime.UtcNow);

    [HttpGet("[action]")]
    public async Task<ActionResult<DateTime>> Live() => Ok(DateTime.UtcNow);
}
