export const DEFAULT_CHAT_MODEL: string = 'chat-model-glm-flash';

interface ChatModel {
	id: string;
	name: string;
	description: string;
}

export const chatModels: Array<ChatModel> = [
	{
		id: 'chat-model-glm-flash',
		name: 'GLM 5.3 Flash',
		description: 'The one true model — thinks, counts, ~$0.00002 a preflight'
	}
];
