using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("[controller]")]
[Route("api/[controller]")]
public class HealthController : ControllerBase
{
    [HttpGet("[action]")]
    public async Task<ActionResult<DateTime>> Live() => Ok(DateTime.UtcNow);
}
