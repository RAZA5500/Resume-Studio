/** Strong resume action verbs (lower case). */
export const ACTION_VERBS = new Set(
  `accelerated accomplished achieved acquired adapted addressed administered advanced advised advocated allocated analyzed
  anticipated applied appointed appraised approved architected arranged assembled assessed assigned attained audited
  authored automated awarded balanced boosted briefed budgeted built calculated campaigned captured catalogued centralized
  chaired championed clarified coached collaborated collected combined communicated compiled completed composed computed
  conceived conceptualized conducted configured consolidated constructed consulted contracted contributed controlled
  converted coordinated counseled created cultivated curated customized cut debugged decreased defined delegated delivered
  demonstrated deployed designed detected determined developed devised diagnosed digitized directed discovered distributed
  documented doubled drafted drove earned edited educated eliminated enabled encouraged engaged engineered enhanced
  established evaluated examined exceeded executed expanded expedited experimented facilitated finalized forecasted formed
  formulated fostered founded generated grew guided halved handled headed identified implemented improved increased
  influenced initiated innovated inspected installed instituted instructed integrated interviewed introduced invented
  investigated launched led leveraged lifted maintained managed mapped marketed maximized measured mediated mentored merged
  migrated minimized mobilized modeled modernized monitored motivated negotiated operated optimized orchestrated organized
  originated outperformed overhauled oversaw partnered performed persuaded piloted pioneered planned prepared presented
  prioritized processed produced programmed promoted proposed prototyped provided published purchased qualified quantified
  raised ranked rebuilt recommended reconciled recruited redesigned reduced refactored refined reengineered regulated
  rehabilitated reorganized repaired replaced reported represented researched resolved restored restructured revamped
  reviewed revised revitalized saved scaled scheduled screened secured selected served shaped simplified single-handedly
  slashed solved sourced spearheaded specialized sponsored standardized steered streamlined strengthened structured
  succeeded supervised supported surpassed surveyed sustained synthesized systematized tailored targeted taught tested
  tracked trained transformed translated tripled troubleshot unified upgraded utilized validated verified visualized
  volunteered won wrote lead manage develop design build create drive deliver implement own oversee analyze optimize
  coordinate support maintain mentor train improve increase reduce launch establish fixed updated responded answered
  entered checked contacted greeted cleaned sorted assisted shipped hired onboarded closed resolved`
    .split(/\s+/)
    .filter(Boolean),
);

export const WEAK_PHRASES = [
  'responsible for',
  'duties included',
  'duties include',
  'worked on',
  'helped with',
  'helped to',
  'assisted with',
  'assisted in',
  'in charge of',
  'tasked with',
  'involved in',
  'participated in',
  'was part of',
  'handled various',
  'various tasks',
  'etc.',
];

export const BUZZWORDS = [
  'hard-working',
  'hardworking',
  'team player',
  'go-getter',
  'self-starter',
  'self starter',
  'detail-oriented',
  'detail oriented',
  'results-driven',
  'results driven',
  'results-oriented',
  'think outside the box',
  'synergy',
  'go-to person',
  'best of breed',
  'rockstar',
  'ninja',
  'guru',
  'people person',
  'value add',
  'dynamic individual',
  'highly motivated',
  'excellent communication skills',
  'works well under pressure',
  'proven track record',
  'passionate about',
];

export const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but
  by can could did do does doing down during each few for from further had has have having he her here hers herself him
  himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other
  our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these
  they this those through to too under until up very was we were what when where which while who whom why will with would
  you your yours yourself yourselves ability able across additional along among another apply applicant applicants based
  benefits best candidate candidates company competitive considered create day days degree demonstrated desired duties
  environment equal equivalent etc every excellent experience experienced employer employment ensure field focus full
  good great help high highly ideal including include includes join key knowledge least level looking make must new
  offer opportunity opportunities part per plus position preferred proven provide qualifications related relevant
  required requirements responsibilities responsible role salary seeking skill skills strong successful support team
  teams time understanding use using well within work working year years you'll we're you're our us may like one two three
  get take need needs want wants way will year's what's`
    .split(/\s+/)
    .filter(Boolean),
);

export const SECTION_SYNONYMS: Record<string, string[]> = {
  summary: [
    'summary',
    'professional summary',
    'career summary',
    'executive summary',
    'profile',
    'professional profile',
    'about me',
    'about',
    'objective',
    'career objective',
    'personal statement',
  ],
  experience: [
    'experience',
    'work experience',
    'professional experience',
    'employment history',
    'employment',
    'work history',
    'career history',
    'relevant experience',
    'professional background',
    'internships',
    'internship',
  ],
  education: [
    'education',
    'academic background',
    'academic qualifications',
    'qualifications',
    'education and training',
    'education & training',
    'academics',
  ],
  skills: [
    'skills',
    'technical skills',
    'core competencies',
    'competencies',
    'key skills',
    'core skills',
    'expertise',
    'areas of expertise',
    'skills & abilities',
    'skills and abilities',
    'technologies',
    'tools',
    'tech stack',
    'skill set',
  ],
  projects: ['projects', 'key projects', 'personal projects', 'selected projects', 'academic projects'],
  certifications: [
    'certifications',
    'certificates',
    'certification',
    'licenses',
    'licenses & certifications',
    'licenses and certifications',
    'courses',
    'training',
  ],
  languages: ['languages', 'language skills'],
  awards: ['awards', 'honors', 'honours', 'achievements', 'accomplishments', 'awards & honors', 'awards and honors'],
  volunteer: ['volunteer', 'volunteering', 'volunteer experience', 'community service'],
  publications: ['publications', 'research', 'papers'],
  interests: ['interests', 'hobbies', 'hobbies & interests', 'activities'],
};

/**
 * Hard + soft skills dictionary used for keyword detection. Very short or
 * ambiguous tokens (e.g. "R", "C", "Go") are deliberately left out to avoid
 * false positives.
 */
export const SKILLS: string[] = [
  // Programming languages
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
  'Scala', 'Perl', 'Dart', 'MATLAB', 'Objective-C', 'Bash', 'PowerShell', 'SQL', 'NoSQL', 'HTML', 'CSS', 'SASS',
  'SCSS', 'Solidity', 'VBA', 'Groovy', 'Elixir', 'Haskell', 'Lua',
  // Frameworks / libraries
  'Angular', 'React', 'React Native', 'Vue.js', 'Next.js', 'Nuxt', 'Svelte', 'Node.js', 'NestJS', 'Express',
  'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring', '.NET', 'ASP.NET', 'Laravel', 'Ruby on Rails', 'Flutter',
  'jQuery', 'Bootstrap', 'Tailwind CSS', 'Redux', 'RxJS', 'NgRx', 'GraphQL', 'REST', 'REST APIs', 'gRPC',
  'WebSockets', 'Microservices', 'Electron', 'Three.js', 'D3.js', 'TensorFlow', 'PyTorch', 'Keras', 'scikit-learn',
  'Pandas', 'NumPy', 'Spark', 'Hadoop', 'Kafka', 'RabbitMQ', 'Celery', 'Hibernate', 'Unity', 'Unreal Engine',
  // Data & AI
  'Machine Learning', 'Deep Learning', 'Artificial Intelligence', 'NLP', 'Natural Language Processing',
  'Computer Vision', 'LLM', 'Generative AI', 'Prompt Engineering', 'Data Analysis', 'Data Analytics',
  'Data Science', 'Data Visualization', 'Data Modeling', 'Data Engineering', 'ETL', 'Data Warehousing',
  'Big Data', 'Statistics', 'Statistical Analysis', 'A/B Testing', 'Predictive Modeling', 'Tableau', 'Power BI',
  'Looker', 'Excel', 'Advanced Excel', 'Google Analytics', 'BigQuery', 'Snowflake', 'Databricks', 'Airflow', 'dbt',
  'SPSS', 'SAS', 'Jupyter',
  // Databases
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'Oracle', 'SQL Server', 'SQLite', 'DynamoDB',
  'Cassandra', 'Firebase', 'Supabase', 'MariaDB', 'Neo4j',
  // Cloud & DevOps
  'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'CI/CD',
  'GitHub Actions', 'GitLab CI', 'Git', 'Linux', 'Unix', 'Nginx', 'Serverless', 'Lambda', 'CloudFormation',
  'Prometheus', 'Grafana', 'Datadog', 'Splunk', 'DevOps', 'SRE', 'Site Reliability', 'Networking', 'TCP/IP',
  'Cybersecurity', 'Information Security', 'Penetration Testing', 'SIEM', 'IAM', 'OAuth', 'Active Directory',
  'VMware', 'Cloud Computing', 'Infrastructure as Code',
  // Engineering practices
  'Agile', 'Scrum', 'Kanban', 'Jira', 'Confluence', 'TDD', 'Unit Testing', 'Test Automation', 'Selenium',
  'Cypress', 'Playwright', 'Jest', 'QA', 'Quality Assurance', 'System Design', 'Software Architecture',
  'Object-Oriented Programming', 'OOP', 'Design Patterns', 'Data Structures', 'Algorithms', 'API Design',
  'Performance Optimization', 'Code Review', 'Technical Documentation', 'SDLC', 'Mobile Development',
  'Web Development', 'Full Stack', 'Frontend', 'Backend', 'Responsive Design', 'Accessibility', 'SEO',
  'Blockchain', 'Embedded Systems', 'IoT',
  // Design
  'Figma', 'Sketch', 'Adobe XD', 'Adobe Photoshop', 'Photoshop', 'Illustrator', 'Adobe Illustrator', 'InDesign',
  'After Effects', 'Premiere Pro', 'Canva', 'UI Design', 'UX Design', 'UI/UX', 'User Research', 'Wireframing',
  'Prototyping', 'Design Systems', 'Interaction Design', 'Visual Design', 'Graphic Design', 'Typography',
  'Branding', 'Motion Graphics', 'Usability Testing', 'Information Architecture', 'AutoCAD', 'SolidWorks', 'Revit',
  'Blender',
  // Product & project
  'Product Management', 'Product Strategy', 'Roadmapping', 'Project Management', 'Program Management', 'PMP',
  'Stakeholder Management', 'Risk Management', 'Change Management', 'Budgeting', 'Resource Planning',
  'Requirements Gathering', 'Business Analysis', 'Process Improvement', 'Lean', 'Six Sigma', 'OKRs', 'KPIs',
  'Vendor Management', 'Strategic Planning', 'Operations Management', 'Supply Chain', 'Logistics',
  'Inventory Management', 'Procurement', 'ERP', 'SAP', 'Salesforce', 'HubSpot', 'Zendesk', 'ServiceNow',
  'Microsoft Office', 'Microsoft Project', 'Asana', 'Trello', 'Notion', 'Slack',
  // Marketing & sales
  'Digital Marketing', 'Content Marketing', 'Social Media Marketing', 'Email Marketing', 'SEM', 'PPC',
  'Google Ads', 'Facebook Ads', 'Marketing Automation', 'Copywriting', 'Content Strategy', 'Brand Management',
  'Market Research', 'Growth Marketing', 'Lead Generation', 'CRM', 'Conversion Rate Optimization', 'Mailchimp',
  'B2B', 'B2C', 'SaaS', 'E-commerce', 'Shopify', 'Sales', 'Business Development', 'Account Management',
  'Negotiation', 'Cold Calling', 'Pipeline Management', 'Customer Success', 'Customer Service',
  'Customer Experience', 'Public Relations', 'Event Management', 'Partnerships',
  // Finance & accounting
  'Financial Analysis', 'Financial Modeling', 'Forecasting', 'Accounting', 'Bookkeeping', 'Auditing', 'GAAP',
  'IFRS', 'Tax', 'Taxation', 'Payroll', 'Accounts Payable', 'Accounts Receivable', 'Reconciliation',
  'QuickBooks', 'Xero', 'Tally', 'Financial Reporting', 'Budget Management', 'Cost Reduction', 'Valuation',
  'Investment Banking', 'Risk Assessment', 'Compliance', 'Anti-Money Laundering', 'CPA', 'ACCA', 'CFA',
  // HR & people
  'Recruitment', 'Talent Acquisition', 'Onboarding', 'Employee Relations', 'Performance Management',
  'Compensation', 'HRIS', 'Workday', 'Training and Development', 'Succession Planning', 'Labor Law',
  'Diversity and Inclusion',
  // Healthcare & education
  'Patient Care', 'Clinical Research', 'EMR', 'EHR', 'HIPAA', 'Nursing', 'Phlebotomy', 'CPR', 'BLS', 'ACLS',
  'Medical Coding', 'Pharmacology', 'Curriculum Development', 'Lesson Planning', 'Classroom Management',
  'Instructional Design', 'E-learning', 'Tutoring', 'Special Education',
  // Soft skills
  'Leadership', 'Team Leadership', 'Communication', 'Public Speaking', 'Presentation Skills', 'Problem Solving',
  'Critical Thinking', 'Time Management', 'Teamwork', 'Collaboration', 'Mentoring', 'Coaching',
  'Conflict Resolution', 'Decision Making', 'Adaptability', 'Creativity', 'Attention to Detail',
  'Analytical Skills', 'Research', 'Writing', 'Technical Writing', 'Cross-functional Collaboration',
  'Emotional Intelligence', 'Multitasking', 'Organization', 'Customer Focus',
];

/** Role keyword → suggested skills, used by the offline AI fallback. */
export const ROLE_SKILLS: Array<{ match: RegExp; hard: string[]; soft: string[] }> = [
  {
    match: /front.?end|angular|react|vue|web developer|ui developer/i,
    hard: ['JavaScript', 'TypeScript', 'Angular', 'React', 'HTML', 'CSS', 'SCSS', 'RxJS', 'REST APIs', 'Responsive Design', 'Accessibility', 'Jest', 'Git', 'Performance Optimization'],
    soft: ['Collaboration', 'Attention to Detail', 'Problem Solving', 'Communication'],
  },
  {
    match: /back.?end|node|java developer|python developer|api|server/i,
    hard: ['Node.js', 'NestJS', 'Python', 'Java', 'PostgreSQL', 'MongoDB', 'Redis', 'REST APIs', 'GraphQL', 'Microservices', 'Docker', 'AWS', 'Unit Testing', 'System Design'],
    soft: ['Problem Solving', 'Critical Thinking', 'Collaboration', 'Mentoring'],
  },
  {
    match: /full.?stack|software|developer|programmer|engineer/i,
    hard: ['JavaScript', 'TypeScript', 'Node.js', 'Angular', 'React', 'PostgreSQL', 'REST APIs', 'Docker', 'AWS', 'Git', 'CI/CD', 'Agile', 'System Design', 'Unit Testing'],
    soft: ['Problem Solving', 'Collaboration', 'Communication', 'Time Management'],
  },
  {
    match: /devops|sre|cloud|infrastructure|platform/i,
    hard: ['AWS', 'Azure', 'Docker', 'Kubernetes', 'Terraform', 'CI/CD', 'GitHub Actions', 'Linux', 'Prometheus', 'Grafana', 'Bash', 'Python', 'Networking', 'Infrastructure as Code'],
    soft: ['Problem Solving', 'Attention to Detail', 'Collaboration', 'Decision Making'],
  },
  {
    match: /data (analyst|analytics)|business intelligence|bi analyst|reporting analyst/i,
    hard: ['SQL', 'Excel', 'Power BI', 'Tableau', 'Python', 'Pandas', 'Data Visualization', 'Statistics', 'Data Modeling', 'ETL', 'Google Analytics', 'A/B Testing'],
    soft: ['Analytical Skills', 'Communication', 'Attention to Detail', 'Critical Thinking'],
  },
  {
    match: /data scien|machine learning|ml engineer|\bai\b|artificial intelligence/i,
    hard: ['Python', 'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'scikit-learn', 'Pandas', 'NumPy', 'SQL', 'Statistics', 'NLP', 'Data Visualization', 'Spark', 'LLM'],
    soft: ['Critical Thinking', 'Research', 'Communication', 'Problem Solving'],
  },
  {
    match: /design|ux|ui\b|product designer|graphic/i,
    hard: ['Figma', 'Adobe XD', 'Photoshop', 'Illustrator', 'UI Design', 'UX Design', 'User Research', 'Wireframing', 'Prototyping', 'Design Systems', 'Usability Testing', 'Typography'],
    soft: ['Creativity', 'Empathy', 'Collaboration', 'Presentation Skills'],
  },
  {
    match: /product manager|product owner/i,
    hard: ['Product Strategy', 'Roadmapping', 'Agile', 'Scrum', 'Jira', 'User Research', 'A/B Testing', 'Data Analysis', 'OKRs', 'Stakeholder Management', 'Requirements Gathering', 'SQL'],
    soft: ['Leadership', 'Communication', 'Decision Making', 'Cross-functional Collaboration'],
  },
  {
    match: /project manager|program manager|scrum master|pmo/i,
    hard: ['Project Management', 'Agile', 'Scrum', 'Risk Management', 'Budgeting', 'Stakeholder Management', 'Jira', 'Microsoft Project', 'Resource Planning', 'KPIs', 'PMP', 'Change Management'],
    soft: ['Leadership', 'Communication', 'Negotiation', 'Time Management'],
  },
  {
    match: /market|seo|content|social media|brand/i,
    hard: ['Digital Marketing', 'SEO', 'SEM', 'Google Ads', 'Google Analytics', 'Content Marketing', 'Social Media Marketing', 'Email Marketing', 'Marketing Automation', 'HubSpot', 'Copywriting', 'Market Research'],
    soft: ['Creativity', 'Communication', 'Analytical Skills', 'Collaboration'],
  },
  {
    match: /sales|business development|account (executive|manager)/i,
    hard: ['Sales', 'Business Development', 'Salesforce', 'CRM', 'Lead Generation', 'Pipeline Management', 'Account Management', 'Negotiation', 'B2B', 'Cold Calling', 'Forecasting'],
    soft: ['Communication', 'Negotiation', 'Relationship Building', 'Resilience'],
  },
  {
    match: /account|finance|financial|audit|tax|bookkeep/i,
    hard: ['Accounting', 'Financial Analysis', 'Financial Reporting', 'Excel', 'QuickBooks', 'GAAP', 'IFRS', 'Reconciliation', 'Forecasting', 'Budget Management', 'Auditing', 'Taxation'],
    soft: ['Attention to Detail', 'Analytical Skills', 'Integrity', 'Time Management'],
  },
  {
    match: /\bhr\b|human resources|recruit|talent/i,
    hard: ['Recruitment', 'Talent Acquisition', 'Onboarding', 'Employee Relations', 'Performance Management', 'HRIS', 'Payroll', 'Compensation', 'Labor Law', 'Training and Development'],
    soft: ['Communication', 'Conflict Resolution', 'Empathy', 'Organization'],
  },
  {
    match: /nurse|medical|health|clinical|doctor|pharmac/i,
    hard: ['Patient Care', 'EMR', 'HIPAA', 'CPR', 'BLS', 'Clinical Research', 'Medical Coding', 'Pharmacology'],
    soft: ['Empathy', 'Communication', 'Attention to Detail', 'Teamwork'],
  },
  {
    match: /teach|tutor|educat|lecturer|professor|instructor/i,
    hard: ['Curriculum Development', 'Lesson Planning', 'Classroom Management', 'Instructional Design', 'E-learning', 'Assessment Design', 'Microsoft Office'],
    soft: ['Communication', 'Patience', 'Mentoring', 'Creativity'],
  },
  {
    match: /customer|support|service|call center|help ?desk/i,
    hard: ['Customer Service', 'Customer Experience', 'Zendesk', 'CRM', 'Ticketing Systems', 'Troubleshooting', 'Salesforce', 'Microsoft Office'],
    soft: ['Communication', 'Empathy', 'Problem Solving', 'Patience'],
  },
];

export const GENERIC_SKILLS = {
  hard: ['Microsoft Office', 'Excel', 'Project Management', 'Data Analysis', 'Process Improvement', 'Reporting', 'CRM', 'Research'],
  soft: ['Communication', 'Leadership', 'Problem Solving', 'Time Management', 'Teamwork', 'Adaptability'],
};
