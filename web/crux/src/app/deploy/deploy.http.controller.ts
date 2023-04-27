import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import {
  ApiBody,
  ApiOperation,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger'
import { Identity } from '@ory/kratos-client'
import HttpLoggerInterceptor from 'src/interceptors/http.logger.interceptor'
import PrismaErrorInterceptor from 'src/interceptors/prisma-error-interceptor'
import { PaginationQuery } from 'src/shared/dtos/paginating'
import UuidParams from 'src/decorators/api-params.decorator'
import UuidValidationGuard from 'src/guards/uuid-params.validation.guard'
import { CreatedResponse, CreatedWithLocation } from '../shared/created-with-location.decorator'
import CreatedWithLocationInterceptor from '../shared/created-with-location.interceptor'
import JwtAuthGuard, { IdentityFromRequest } from '../token/jwt-auth.guard'
import {
  CreateDeploymentDto,
  DeploymentDetailsDto,
  DeploymentDto,
  DeploymentEventDto,
  DeploymentLogListDto,
  InstanceDto,
  InstanceSecretsDto,
  PatchDeploymentDto,
  PatchInstanceDto,
} from './deploy.dto'
import DeployService from './deploy.service'
import DeployCreateTeamAccessGuard from './guards/deploy.create.team-access.guard'
import DeployTeamAccessGuard from './guards/deploy.team-access.guard'
import DeployCopyValidationInterceptor from './interceptors/deploy.copy.interceptor'
import DeployCreateValidationInterceptor from './interceptors/deploy.create.interceptor'
import DeleteDeploymentValidationInterceptor from './interceptors/deploy.delete.interceptor'
import DeployPatchValidationInterceptor from './interceptors/deploy.patch.interceptor'
import DeployStartValidationInterceptor from './interceptors/deploy.start.interceptor'

const PARAM_DEPLOYMENT_ID = 'deploymentId'
const PARAM_INSTANCE_ID = 'instanceId'
const DeploymentId = () => Param(PARAM_DEPLOYMENT_ID)
const InstanceId = () => Param(PARAM_INSTANCE_ID)

const ROUTE_DEPLOYMENTS = 'deployments'
const ROUTE_DEPLOYMENT_ID = ':deploymentId'
const ROUTE_INSTANCES = 'instances'
const ROUTE_INSTANCE_ID = ':instanceId'

@Controller(ROUTE_DEPLOYMENTS)
@ApiTags(ROUTE_DEPLOYMENTS)
@UseGuards(JwtAuthGuard, UuidValidationGuard, DeployTeamAccessGuard)
@UsePipes(
  new ValidationPipe({
    // TODO(@robot9706): Move to global pipes after removing gRPC
    transform: true,
  }),
)
@UseInterceptors(HttpLoggerInterceptor, PrismaErrorInterceptor, CreatedWithLocationInterceptor)
export default class DeployHttpController {
  constructor(private service: DeployService) {}

  @Get()
  @ApiOperation({
    description:
      'Get details of deployments. Deployment details should include `id`, `prefix`, `status`, `note`, `audit` log details, product `name`, `id`, `type`, version `name`, `type`, `id`, and node `name`, `id`, `type`.',
    summary: 'Fetch data of deployments.',
  })
  @ApiOkResponse({
    type: DeploymentDto,
    isArray: true,
    description: 'Details of deployments listed.',
  })
  async getDeployments(@IdentityFromRequest() identity: Identity): Promise<DeploymentDto[]> {
    return await this.service.getDeployments(identity)
  }

  @Get(ROUTE_DEPLOYMENT_ID)
  @HttpCode(200)
  @ApiOperation({
    description:
      'Get details of a certain deployment. Request must include `deploymentId`. Deployment details should include `id`, `prefix`, `environment`, `status`, `note`, `audit` log details, product `name`, `id`, `type`, version `name`, `type`, `id`, and node `name`, `id`, `type`.',
    summary: 'Retrieve data of a deployment.',
  })
  @ApiOkResponse({ type: DeploymentDetailsDto, description: 'Data of a deployment is listed.' })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async getDeploymentDetails(@DeploymentId() deploymentId: string): Promise<DeploymentDetailsDto> {
    return await this.service.getDeploymentDetails(deploymentId)
  }

  @Get(`${ROUTE_DEPLOYMENT_ID}/events`)
  @HttpCode(200)
  @ApiOperation({
    description:
      'Request must include `deploymentId`. Response should include `type`, `deploymentStatus`, `createdAt`, `log`, and `containerState` which consists of `state` and `instanceId`.',
    summary: 'Fetch event log of a deployment.',
  })
  @ApiOkResponse({
    type: DeploymentEventDto,
    isArray: true,
    description: 'Event log listed.',
  })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async getDeploymentEvents(@DeploymentId() deploymentId: string): Promise<DeploymentEventDto[]> {
    return await this.service.getDeploymentEvents(deploymentId)
  }

  @Get(`${ROUTE_DEPLOYMENT_ID}/${ROUTE_INSTANCES}/${ROUTE_INSTANCE_ID}`)
  @HttpCode(200)
  @ApiOperation({
    description:
      'Request must include `deploymentId` and `instanceId`, which refers to the ID of a deployed container. Response should include `state`, `id`, `updatedAt`, and `image` details including `id`, `name`, `tag`, `order` and `config` variables.',
    summary: 'Get details of a deployed container.',
  })
  @ApiOkResponse({ type: InstanceDto, description: 'Details of deployed container listed.' })
  @UuidParams(PARAM_DEPLOYMENT_ID, PARAM_INSTANCE_ID)
  async getInstance(@DeploymentId() _deploymentId: string, @InstanceId() instanceId: string): Promise<InstanceDto> {
    return await this.service.getInstance(instanceId)
  }

  @Get(`${ROUTE_DEPLOYMENT_ID}/${ROUTE_INSTANCES}/${ROUTE_INSTANCE_ID}/secrets`)
  @HttpCode(200)
  @ApiOperation({
    description:
      'Request must include `deploymentId` and `instanceId`, which refers to the ID of a deployed container. Response should include container `prefix` and `name`, and `publicKey`, `keys`.',
    summary: 'Fetch secrets of a deployed container.',
  })
  @ApiOkResponse({ type: InstanceSecretsDto, description: 'Secrets of a deployed container listed.' })
  @UuidParams(PARAM_DEPLOYMENT_ID, PARAM_INSTANCE_ID)
  async getDeploymentSecrets(
    @DeploymentId() _deploymentId: string,
    @InstanceId() instanceId: string,
  ): Promise<InstanceSecretsDto> {
    return await this.service.getInstanceSecrets(instanceId)
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({
    description:
      'Request must include `versionId`, `nodeId`, and `prefix`, which refers to the ID of a deployed container. Response should include deployment `id`, `prefix`, `status`, `note`, and `audit` log details, as well as product `type`, `id`, `name`, version `type`, `id`, `name`, and node `type`, `id`, `name`.',
    summary: 'Create new deployment.',
  })
  @CreatedWithLocation()
  @ApiBody({ type: CreateDeploymentDto })
  @ApiCreatedResponse({ type: DeploymentDto, description: 'New deployment created.' })
  @UseGuards(DeployCreateTeamAccessGuard)
  @UseInterceptors(DeployCreateValidationInterceptor)
  async createDeployment(
    @Body() request: CreateDeploymentDto,
    @IdentityFromRequest() identity: Identity,
  ): Promise<CreatedResponse<DeploymentDto>> {
    const deployment = await this.service.createDeployment(request, identity)

    return {
      url: DeployHttpController.locationOf(deployment.id),
      body: deployment,
    }
  }

  @Patch(ROUTE_DEPLOYMENT_ID)
  @HttpCode(204)
  @ApiOperation({
    description: 'Request must include `deploymentId`.',
    summary: 'Update deployment.',
  })
  @UseInterceptors(DeployPatchValidationInterceptor)
  @ApiNoContentResponse({ description: 'Deployment modified.' })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async patchDeployment(
    @DeploymentId() deploymentId: string,
    @Body() request: PatchDeploymentDto,
    @IdentityFromRequest() identity: Identity,
  ): Promise<void> {
    await this.service.patchDeployment(deploymentId, request, identity)
  }

  @Patch(`${ROUTE_DEPLOYMENT_ID}/${ROUTE_INSTANCES}/${ROUTE_INSTANCE_ID}`)
  @HttpCode(204)
  @ApiOperation({
    description:
      'Request must include `deploymentId` and `instanceId`. Response should include `config` variables in an array.',
    summary: 'Update instance configuration.',
  })
  @UseInterceptors(DeployPatchValidationInterceptor)
  @ApiNoContentResponse({ description: 'Instance configuration updated.' })
  @UuidParams(PARAM_DEPLOYMENT_ID, PARAM_INSTANCE_ID)
  async patchInstance(
    @DeploymentId() deploymentId: string,
    @InstanceId() instanceId: string,
    @Body() request: PatchInstanceDto,
    @IdentityFromRequest() identity: Identity,
  ): Promise<void> {
    await this.service.patchInstance(deploymentId, instanceId, request, identity)
  }

  @Delete(ROUTE_DEPLOYMENT_ID)
  @HttpCode(204)
  @ApiOperation({
    description: 'Request must include `deploymentId`.',
    summary: 'Delete deployment.',
  })
  @UseInterceptors(DeleteDeploymentValidationInterceptor)
  @ApiNoContentResponse({ description: 'Deployment deleted.' })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async deleteDeployment(@DeploymentId() deploymentId: string): Promise<void> {
    await this.service.deleteDeployment(deploymentId)
  }

  @Post(`${ROUTE_DEPLOYMENT_ID}/start`)
  @HttpCode(204)
  @ApiOperation({
    description: 'Request must include `deploymentId`.',
    summary: 'Start deployment.',
  })
  @UseInterceptors(DeployStartValidationInterceptor)
  @ApiNoContentResponse({ description: 'Deployment initiated.' })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async startDeployment(
    @DeploymentId() deploymentId: string,
    @IdentityFromRequest() identity: Identity,
  ): Promise<void> {
    await this.service.startDeployment(deploymentId, identity)
  }

  @Post(`${ROUTE_DEPLOYMENT_ID}/copy`)
  @HttpCode(201)
  @ApiOperation({
    description:
      'Request must include `deploymentId` and `force`, which is a boolean variable. Response should include deployment data: `id`, `prefix`, `status`, `note`, and miscellaneous details of `audit` log, `product`, `version`, and `node`.',
    summary: 'Copy deployment.',
  })
  @CreatedWithLocation()
  @UseInterceptors(DeployCopyValidationInterceptor)
  @ApiCreatedResponse({ type: DeploymentDto, description: 'Deployment copied.' })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async copyDeployment(
    @Query('force') _: boolean,
    @DeploymentId() deploymentId: string,
    @IdentityFromRequest() identity: Identity,
  ): Promise<CreatedResponse<DeploymentDto>> {
    const deployment = await this.service.copyDeployment(deploymentId, identity)
    return {
      url: DeployHttpController.locationOf(deployment.id),
      body: deployment,
    }
  }

  @Get(`${ROUTE_DEPLOYMENT_ID}/log`)
  @ApiOkResponse({ type: DeploymentLogListDto })
  @UuidParams(PARAM_DEPLOYMENT_ID)
  async deploymentLog(
    @DeploymentId() deploymentId: string,
    @Query() query: PaginationQuery,
  ): Promise<DeploymentLogListDto> {
    return this.service.getDeploymentLog(deploymentId, query)
  }

  private static locationOf(deploymentId: string) {
    return `/${ROUTE_DEPLOYMENTS}/${deploymentId}`
  }
}
