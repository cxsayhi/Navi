FROM maven:3.9.16-eclipse-temurin-21@sha256:c2a2c58516d160f43b50f12baa427ca86989e0bc942609e04aff61da5d9a7d74 AS build

WORKDIR /app

COPY pom.xml ./
COPY src ./src
RUN mvn package -B

FROM eclipse-temurin:21.0.12_8-jre-jammy@sha256:61d6c7b34d36aee3f45d043101259f97f3c6d428dc2a6f75513789983c5e254f

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
