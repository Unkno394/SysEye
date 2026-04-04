using Application.DTO;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace Web.Controllers;

[Authorize]
[ApiController]
[Route("api/[controller]")]
public class TaskController(
    ITaskService taskService,
    ILogger<TaskController> logger) : ControllerBase
{
    [HttpPost("agents/{agentId:guid}/execute")]
    public async Task<IActionResult> ExecuteCommand(
        [FromRoute] Guid agentId,
        [FromBody] ExecuteCommandRequest request,
        CancellationToken cancellationToken)
    {
        var executionId = await taskService.ExecuteCommandAsync(
            User.GetUserId(),
            agentId,
            request,
            cancellationToken);

        return Ok(new
        {
            message = "Команда отправлена агенту",
            executionId
        });
    }
}


