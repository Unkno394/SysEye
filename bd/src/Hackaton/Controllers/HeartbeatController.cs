using Microsoft.AspNetCore.Mvc;

namespace API.Controllers;

[ApiController]
[Route("[controller]")]
public class HeartbeatController : ControllerBase
{
    [HttpGet()]
    public async Task<ActionResult<DateTime>> Live() => Ok(DateTime.UtcNow);
}