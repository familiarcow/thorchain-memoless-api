import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';
import path from 'path';
import fs from 'fs';
import YAML from 'yamljs';

export class SwaggerConfig {
  private static swaggerSpec: any = null;

  /**
   * Initialize Swagger documentation
   */
  static initialize(app: Application): void {
    console.log('📚 Initializing Swagger documentation...');

    try {
      // Load OpenAPI spec from YAML file
      const specPath = path.join(__dirname, '..', 'swagger.yaml');
      
      if (!fs.existsSync(specPath)) {
        console.error('❌ Swagger spec file not found:', specPath);
        return;
      }

      // Load the YAML specification
      this.swaggerSpec = YAML.load(specPath);
      
      // Update server URLs based on environment
      this.updateServerUrls();
      
      // Swagger UI options
      const swaggerUiOptions = {
        explorer: true,
        swaggerOptions: {
          persistAuthorization: true,
          displayRequestDuration: true,
          filter: true,
          showExtensions: true,
          showCommonExtensions: true,
          tryItOutEnabled: true,
          supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
          deepLinking: true,
          defaultModelsExpandDepth: 1,
          defaultModelExpandDepth: 1,
        },
        customCss: this.getCustomCSS(),
        customSiteTitle: 'THORChain Memoless API Documentation',
        customfavIcon: '/favicon.ico',
      };

      // Serve Swagger UI
      app.use('/docs', swaggerUi.serve);
      app.get('/docs', swaggerUi.setup(this.swaggerSpec, swaggerUiOptions));

      // Serve raw OpenAPI spec
      app.get('/api/openapi.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(this.swaggerSpec);
      });

      app.get('/api/openapi.yaml', (req, res) => {
        res.setHeader('Content-Type', 'text/yaml');
        res.send(YAML.stringify(this.swaggerSpec, 2));
      });

      console.log('✅ Swagger documentation initialized');
      console.log('📖 Swagger UI available at: /docs');
      console.log('📄 OpenAPI JSON spec: /api/openapi.json');
      console.log('📄 OpenAPI YAML spec: /api/openapi.yaml');

    } catch (error) {
      console.error('❌ Failed to initialize Swagger:', error);
    }
  }

  /**
   * Update server URLs based on current environment
   */
  private static updateServerUrls(): void {
    const port = process.env.PORT || '3000';
    const environment = process.env.NODE_ENV || 'development';
    
    if (environment === 'development') {
      this.swaggerSpec.servers = [
        {
          url: `http://localhost:${port}`,
          description: 'Development server'
        }
      ];
    }
    
    // Add network info to the description
    const network = process.env.THORCHAIN_NETWORK || 'stagenet';
    const originalDescription = this.swaggerSpec.info.description;
    this.swaggerSpec.info.description = `${originalDescription}\n\n**Current Network**: ${network.toUpperCase()}`;
  }

  /**
   * Custom CSS for better looking Swagger UI
   */
  private static getCustomCSS(): string {
    return `
      .swagger-ui .topbar {
        background-color: #1f2937;
        border-bottom: 3px solid #10b981;
      }
      
      .swagger-ui .topbar .download-url-wrapper {
        display: none;
      }
      
      .swagger-ui .info {
        margin: 20px 0;
      }
      
      .swagger-ui .info .title {
        color: #1f2937;
        font-size: 2rem;
        font-weight: bold;
      }
      
      .swagger-ui .info .description {
        color: #4b5563;
        font-size: 1rem;
        line-height: 1.6;
      }
      
      .swagger-ui .info .description p {
        margin: 10px 0;
      }
      
      .swagger-ui .info .description h2 {
        color: #1f2937;
        font-size: 1.25rem;
        font-weight: 600;
        margin: 20px 0 10px 0;
      }
      
      .swagger-ui .scheme-container {
        background: #f9fafb;
        border-radius: 8px;
        padding: 20px;
        margin: 20px 0;
      }
      
      .swagger-ui .opblock {
        border-radius: 8px;
        margin-bottom: 15px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .swagger-ui .opblock.opblock-get .opblock-summary {
        background-color: #10b981;
        border-color: #10b981;
      }
      
      .swagger-ui .opblock.opblock-post .opblock-summary {
        background-color: #3b82f6;
        border-color: #3b82f6;
      }
      
      .swagger-ui .opblock .opblock-summary {
        padding: 15px 20px;
      }
      
      .swagger-ui .opblock-summary-description {
        font-size: 0.95rem;
        color: rgba(255,255,255,0.9);
        margin-top: 5px;
      }
      
      .swagger-ui .btn.execute {
        background-color: #10b981;
        border-color: #10b981;
        color: white;
        font-weight: 600;
        padding: 10px 25px;
        border-radius: 6px;
        transition: all 0.2s;
      }
      
      .swagger-ui .btn.execute:hover {
        background-color: #059669;
        border-color: #059669;
        transform: translateY(-1px);
      }
      
      .swagger-ui .response-col_status {
        font-weight: bold;
      }
      
      .swagger-ui .response-col_status.response-200 {
        color: #10b981;
      }
      
      .swagger-ui .response-col_status.response-400,
      .swagger-ui .response-col_status.response-404 {
        color: #f59e0b;
      }
      
      .swagger-ui .response-col_status.response-500 {
        color: #ef4444;
      }
      
      .swagger-ui .parameters-container {
        background: #f8fafc;
        border-radius: 6px;
        padding: 15px;
      }
      
      .swagger-ui .parameter__name {
        font-weight: 600;
        color: #374151;
      }
      
      .swagger-ui .parameter__type {
        color: #6b7280;
        font-size: 0.875rem;
      }
      
      .swagger-ui textarea,
      .swagger-ui input[type="text"],
      .swagger-ui input[type="email"] {
        border: 2px solid #e5e7eb;
        border-radius: 6px;
        padding: 10px;
        font-size: 0.95rem;
        transition: border-color 0.2s;
      }
      
      .swagger-ui textarea:focus,
      .swagger-ui input[type="text"]:focus,
      .swagger-ui input[type="email"]:focus {
        border-color: #10b981;
        outline: none;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
      }
      
      .swagger-ui .model-box {
        background: #f8fafc;
        border-radius: 6px;
        padding: 15px;
        margin: 10px 0;
      }
      
      .swagger-ui .model-title {
        color: #374151;
        font-weight: 600;
        margin-bottom: 10px;
      }
      
      .swagger-ui .prop-type {
        color: #7c3aed;
        font-weight: 600;
      }
      
      .swagger-ui .prop-format {
        color: #6b7280;
        font-style: italic;
      }
      
    `;
  }

  /**
   * Get the current Swagger spec (useful for testing)
   */
  static getSpec(): any {
    return this.swaggerSpec;
  }

  /**
   * Add or update a path in the specification
   */
  static addPath(path: string, methods: any): void {
    if (!this.swaggerSpec || !this.swaggerSpec.paths) {
      console.error('❌ Swagger spec not initialized');
      return;
    }

    this.swaggerSpec.paths[path] = methods;
    console.log(`📚 Added path to Swagger spec: ${path}`);
  }

  /**
   * Add or update a schema in the specification
   */
  static addSchema(name: string, schema: any): void {
    if (!this.swaggerSpec || !this.swaggerSpec.components || !this.swaggerSpec.components.schemas) {
      console.error('❌ Swagger spec not initialized');
      return;
    }

    this.swaggerSpec.components.schemas[name] = schema;
    console.log(`📚 Added schema to Swagger spec: ${name}`);
  }
}