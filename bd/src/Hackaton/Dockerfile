FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY src/*.sln .
COPY src/Application/*.csproj Application/
COPY src/Domain/*.csproj Domain/
COPY src/Hackaton/*.csproj Hackaton/
COPY src/Infrastructure/*.csproj Infrastructure/

RUN dotnet sln remove Test/Test.csproj 2>/dev/null || true
RUN dotnet restore

COPY src .

WORKDIR /src/Hackaton
RUN dotnet publish Web.csproj -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y curl --no-install-recommends && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

COPY --from=build /src/Resources /app/Resources

RUN addgroup --system --gid 1000 appgroup && \
    adduser --system --uid 1000 --gid 1000 appuser && \
    chown -R appuser:appgroup /app
USER appuser

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:80

EXPOSE 80

ENTRYPOINT ["dotnet", "Web.dll"]