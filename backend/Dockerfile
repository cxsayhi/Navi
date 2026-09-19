FROM maven:3.9.9-eclipse-temurin-21 AS build

WORKDIR /app

COPY pom.xml ./
COPY src ./src
RUN mvn package -B

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system wanderline \
    && useradd --system --gid wanderline --no-create-home wanderline
WORKDIR /app

COPY --from=build /app/target/wanderline-api-*.jar app.jar

USER wanderline
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
