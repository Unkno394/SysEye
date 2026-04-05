using Application.DTO.Analytics;
using Application.Exporters.Interfaces;
using QuestPDF.Fluent;

namespace Application.Exporters;

public class AnalyticsPdfExporter : IAnalyticsPdfExporter
{
    public ExportFileDto Export(AnalyticsFullExportDto data)
    {
        var bytes = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Margin(20);

                page.Header()
                    .Text("Отчёт по выполнениям задач")
                    .FontSize(20)
                    .Bold();

                page.Content().Column(column =>
                {
                    column.Spacing(12);

                    column.Item().Text($"Дата экспорта (UTC): {data.ExportedAtUtc:yyyy-MM-dd HH:mm:ss}");

                    column.Item().Text("Аналитика по агентам").FontSize(16).Bold();
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("Агент").Bold();
                            header.Cell().Text("Exec").Bold();
                            header.Cell().Text("Err").Bold();
                            header.Cell().Text("Rate").Bold();
                            header.Cell().Text("Avg").Bold();
                            header.Cell().Text("Min").Bold();
                            header.Cell().Text("Max").Bold();
                        });

                        foreach (var item in data.AgentAnalytics)
                        {
                            table.Cell().Text(item.AgentName);
                            table.Cell().Text(item.Total.Executions.ToString());
                            table.Cell().Text(item.Total.Errors.ToString());
                            table.Cell().Text($"{item.Total.SuccessRate:F2}%");
                            table.Cell().Text($"{item.Total.AverageDurationSeconds:F2}");
                            table.Cell().Text($"{item.Total.MinDurationSeconds:F2}");
                            table.Cell().Text($"{item.Total.MaxDurationSeconds:F2}");
                        }
                    });

                    column.Item().Text("Аналитика по командам").FontSize(16).Bold();
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                            columns.RelativeColumn(1);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("Команда").Bold();
                            header.Cell().Text("Exec").Bold();
                            header.Cell().Text("Err").Bold();
                            header.Cell().Text("Rate").Bold();
                            header.Cell().Text("Avg").Bold();
                            header.Cell().Text("Min").Bold();
                            header.Cell().Text("Max").Bold();
                        });

                        foreach (var item in data.CommandAnalytics)
                        {
                            table.Cell().Text(item.CommandName);
                            table.Cell().Text(item.Total.Executions.ToString());
                            table.Cell().Text(item.Total.Errors.ToString());
                            table.Cell().Text($"{item.Total.SuccessRate:F2}%");
                            table.Cell().Text($"{item.Total.AverageDurationSeconds:F2}");
                            table.Cell().Text($"{item.Total.MinDurationSeconds:F2}");
                            table.Cell().Text($"{item.Total.MaxDurationSeconds:F2}");
                        }
                    });

                    column.Item().Text("Выполнения задач").FontSize(16).Bold();
                    column.Item().Table(table =>
                    {
                        table.ColumnsDefinition(columns =>
                        {
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(3);
                            columns.RelativeColumn(2);
                            columns.RelativeColumn(1);
                        });

                        table.Header(header =>
                        {
                            header.Cell().Text("AgentId").Bold();
                            header.Cell().Text("CommandId").Bold();
                            header.Cell().Text("StartedAt").Bold();
                            header.Cell().Text("Duration").Bold();
                            header.Cell().Text("OK").Bold();
                        });

                        foreach (var item in data.TaskExecutions)
                        {
                            table.Cell().Text(item.AgentId.ToString());
                            table.Cell().Text(item.CommandId.ToString());
                            table.Cell().Text(item.StartedAt.ToString("yyyy-MM-dd HH:mm:ss"));
                            table.Cell().Text(item.DurationSeconds.ToString("F2"));
                            table.Cell().Text(item.IsSuccess ? "Yes" : "No");
                        }
                    });
                });
            });
        }).GeneratePdf();

        return new ExportFileDto
        {
            Content = bytes,
            ContentType = "application/pdf",
            FileName = $"analytics-{DateTime.UtcNow:yyyyMMdd-HHmmss}.pdf"
        };
    }
}
