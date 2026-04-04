using Application.Interfaces;
using Microsoft.AspNetCore.Mvc;
using Web.Contracts.Requests;
using Web.Middlewares;

namespace Web.Controllers;

[ApiController]
[Route("internal/task")]
[ProducesResponseType(401)]
public class InternalTaskController(ITaskService taskService) : ControllerBase
{
    [HttpPost("output")]
    public async Task<IActionResult> AppendOutput([FromBody] InternalTaskOutputRequest request, CancellationToken ct)
    {
        if (!TryGetApiKeyUserId(out var userId))
            return Unauthorized();

        await taskService.AppendOutputAsync(request.TaskId, userId, request.Chunk, ct);
        return Ok();
    }

    [HttpPost("result")]
    public async Task<IActionResult> Complete([FromBody] InternalTaskResultRequest request, CancellationToken ct)
    {
        if (!TryGetApiKeyUserId(out var userId))
            return Unauthorized();

        await taskService.CompleteTaskAsync(request.TaskId, userId, request.Status, request.Stdout, request.Stderr, request.ExitCode, ct);
        return Ok();
    }

    private bool TryGetApiKeyUserId(out Guid userId)
    {
        if (HttpContext.Items.TryGetValue(ApiKeyMiddleware.ApiKeyUserIdItemKey, out var rawUserId) && rawUserId is Guid parsed)
        {
            userId = parsed;
            return true;
        }

        userId = Guid.Empty;
        return false;
    }
}
