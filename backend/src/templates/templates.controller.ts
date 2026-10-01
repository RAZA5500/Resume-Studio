import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../common/auth/auth.decorators.js';
import { QueryTemplatesDto } from './dto/query-templates.dto.js';
import { TemplatesService } from './templates.service.js';

@Public()
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  list(@Query() query: QueryTemplatesDto) {
    return this.templates.list(query);
  }

  @Get('meta')
  meta() {
    return this.templates.meta();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templates.findOne(id);
  }
}
